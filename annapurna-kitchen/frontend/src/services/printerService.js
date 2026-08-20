/**
 * Printing.
 *
 * The printer hangs off the billing device, not the server (02-TRD), so every
 * transport here runs in the browser:
 *
 *   browser    window.print() against a hidden .print-area (invoices)
 *   qz         QZ Tray websocket on localhost - the usual POS bridge
 *   webusb     direct USB bulk transfer to an ESC/POS printer
 *   bluetooth  Web Bluetooth GATT write to a thermal printer
 *
 * Every call resolves to {ok, transport, message}. A failure is never
 * swallowed - the caller shows a retry prompt (08-UI-UX).
 */
import { buildKot, buildReceipt, buildTest } from '../utils/escpos'

const QZ_HOST = import.meta.env.VITE_QZ_HOST || 'localhost:8181'

export const TRANSPORTS = {
  BROWSER: 'browser',
  QZ: 'qz',
  WEBUSB: 'webusb',
  BLUETOOTH: 'bluetooth',
  NONE: 'none',
}

export class PrintError extends Error {
  constructor(message, { transport, retryable = true } = {}) {
    super(message)
    this.name = 'PrintError'
    this.transport = transport
    this.retryable = retryable
  }
}

/* ------------------------------------------------------------------ browser */

/**
 * Renders whatever is inside the element with `.print-area` and calls the
 * browser print dialog. Resolves once the dialog has been dismissed.
 */
function printViaBrowser() {
  return new Promise((resolve, reject) => {
    const area = document.querySelector('.print-area')
    if (!area || !area.innerHTML.trim()) {
      reject(new PrintError('Nothing is staged for printing.', { transport: 'browser' }))
      return
    }
    const done = () => {
      window.removeEventListener('afterprint', done)
      resolve({ ok: true, transport: 'browser', message: 'Sent to the browser print dialog.' })
    }
    window.addEventListener('afterprint', done)
    try {
      window.print()
      // Safari/Firefox do not always fire afterprint; resolve defensively.
      setTimeout(done, 1500)
    } catch (error) {
      window.removeEventListener('afterprint', done)
      reject(new PrintError(error.message || 'The browser refused to print.', {
        transport: 'browser',
      }))
    }
  })
}

/* ----------------------------------------------------------------- QZ Tray */

let qzSocket = null

function qzConnect() {
  if (qzSocket && qzSocket.readyState === WebSocket.OPEN) return Promise.resolve(qzSocket)
  return new Promise((resolve, reject) => {
    let socket
    try {
      socket = new WebSocket(`wss://${QZ_HOST}`)
    } catch {
      reject(new PrintError('QZ Tray is not reachable.', { transport: 'qz' }))
      return
    }
    const timer = setTimeout(() => {
      socket.close()
      reject(
        new PrintError(
          'QZ Tray did not respond. Is it running on this machine?',
          { transport: 'qz' }
        )
      )
    }, 4000)

    socket.onopen = () => {
      clearTimeout(timer)
      qzSocket = socket
      resolve(socket)
    }
    socket.onerror = () => {
      clearTimeout(timer)
      reject(
        new PrintError('Could not connect to QZ Tray on ' + QZ_HOST + '.', { transport: 'qz' })
      )
    }
    socket.onclose = () => {
      if (qzSocket === socket) qzSocket = null
    }
  })
}

function toBase64(bytes) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

async function printViaQz(bytes, printerName) {
  if (!printerName) {
    throw new PrintError('No QZ printer name is configured in Settings.', { transport: 'qz' })
  }
  const socket = await qzConnect()
  const message = {
    call: 'print',
    params: {
      printer: { name: printerName },
      data: [{ type: 'raw', format: 'base64', data: toBase64(bytes) }],
    },
    uid: `ak-${Date.now()}`,
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage)
      reject(new PrintError('QZ Tray accepted no reply in time.', { transport: 'qz' }))
    }, 8000)

    function onMessage(event) {
      let body
      try {
        body = JSON.parse(event.data)
      } catch {
        return
      }
      if (body.uid !== message.uid) return
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      if (body.error) {
        reject(new PrintError(String(body.error), { transport: 'qz' }))
      } else {
        resolve({ ok: true, transport: 'qz', message: `Sent to ${printerName}.` })
      }
    }

    socket.addEventListener('message', onMessage)
    try {
      socket.send(JSON.stringify(message))
    } catch (error) {
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      reject(new PrintError(error.message, { transport: 'qz' }))
    }
  })
}

/* ------------------------------------------------------------------ WebUSB */

let usbDevice = null

async function printViaUsb(bytes) {
  if (!('usb' in navigator)) {
    throw new PrintError('This browser does not support WebUSB.', {
      transport: 'webusb',
      retryable: false,
    })
  }
  if (!usbDevice || !usbDevice.opened) {
    // Requires a user gesture; the caller triggers printing from a click.
    usbDevice = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] })
    await usbDevice.open()
    if (usbDevice.configuration === null) await usbDevice.selectConfiguration(1)
    const iface = usbDevice.configuration.interfaces.find((i) =>
      i.alternates.some((alt) => alt.interfaceClass === 7)
    )
    if (!iface) throw new PrintError('No printer interface on that USB device.', {
      transport: 'webusb',
    })
    await usbDevice.claimInterface(iface.interfaceNumber)
    usbDevice.__iface = iface
  }
  const alternate = usbDevice.__iface.alternates.find((alt) => alt.interfaceClass === 7)
  const endpoint = alternate.endpoints.find((e) => e.direction === 'out')
  if (!endpoint) throw new PrintError('That printer exposes no OUT endpoint.', {
    transport: 'webusb',
  })
  const result = await usbDevice.transferOut(endpoint.endpointNumber, bytes)
  if (result.status !== 'ok') {
    throw new PrintError(`USB transfer returned "${result.status}".`, { transport: 'webusb' })
  }
  return { ok: true, transport: 'webusb', message: 'Sent over USB.' }
}

/* --------------------------------------------------------------- Bluetooth */

let btCharacteristic = null

async function printViaBluetooth(bytes) {
  if (!navigator.bluetooth) {
    throw new PrintError('This browser does not support Web Bluetooth.', {
      transport: 'bluetooth',
      retryable: false,
    })
  }
  if (!btCharacteristic) {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    })
    const server = await device.gatt.connect()
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
    const characteristics = await service.getCharacteristics()
    btCharacteristic = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse)
    if (!btCharacteristic) {
      throw new PrintError('That printer exposes no writable characteristic.', {
        transport: 'bluetooth',
      })
    }
    device.addEventListener('gattserverdisconnected', () => {
      btCharacteristic = null
    })
  }
  // BLE MTU is small; send in chunks.
  const CHUNK = 180
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.slice(offset, offset + CHUNK)
    if (btCharacteristic.writeValueWithoutResponse) {
      await btCharacteristic.writeValueWithoutResponse(slice)
    } else {
      await btCharacteristic.writeValue(slice)
    }
  }
  return { ok: true, transport: 'bluetooth', message: 'Sent over Bluetooth.' }
}

/* -------------------------------------------------------------- public API */

async function send(bytes, { transport, printerName }) {
  switch (transport) {
    case TRANSPORTS.QZ:
      return printViaQz(bytes, printerName)
    case TRANSPORTS.WEBUSB:
      return printViaUsb(bytes)
    case TRANSPORTS.BLUETOOTH:
      return printViaBluetooth(bytes)
    case TRANSPORTS.NONE:
      return { ok: true, transport: 'none', message: 'Printing is switched off in Settings.' }
    default:
      return printViaBrowser()
  }
}

export const printerService = {
  TRANSPORTS,

  capabilities() {
    return {
      browser: true,
      qz: 'WebSocket' in window,
      webusb: 'usb' in navigator,
      bluetooth: Boolean(navigator.bluetooth),
    }
  },

  /**
   * @param {'receipt'|'kot'|'test'} kind
   * @param {object} payload  receipt/KOT payload from the API
   * @param {object} options  {transport, printerName, paperWidth}
   */
  async print(kind, payload, options = {}) {
    const transport = options.transport || TRANSPORTS.BROWSER
    const paperWidth = Number(options.paperWidth || 80)

    if (transport === TRANSPORTS.BROWSER) {
      // The DOM template is already staged by the caller; nothing to encode.
      return printViaBrowser()
    }

    let bytes
    if (kind === 'receipt') bytes = buildReceipt(payload, paperWidth)
    else if (kind === 'kot') bytes = buildKot(payload, paperWidth)
    else bytes = buildTest(payload, paperWidth)

    return send(bytes, { transport, printerName: options.printerName })
  },

  /** Preview the exact text a thermal printer would emit (Settings screen). */
  preview(kind, payload, paperWidth = 80) {
    const bytes =
      kind === 'receipt'
        ? buildReceipt(payload, paperWidth)
        : kind === 'kot'
          ? buildKot(payload, paperWidth)
          : buildTest(payload, paperWidth)
    return Array.from(bytes)
      .map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : byte === 10 ? '\n' : ''))
      .join('')
  },

  disconnect() {
    if (qzSocket) {
      qzSocket.close()
      qzSocket = null
    }
    btCharacteristic = null
    if (usbDevice?.opened) usbDevice.close().catch(() => {})
    usbDevice = null
  },
}

export default printerService
