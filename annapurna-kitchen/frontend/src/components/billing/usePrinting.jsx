import { useCallback, useState } from 'react'
import printerService from '../../services/printerService'
import { useAppData } from '../../context/AppDataContext'
import { useToast } from '../../context/ToastContext'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { IconAlert, IconCheck, IconPrint } from '../common/Icons'

/**
 * Printing with an explicit, retryable failure path.
 *
 * 08-UI-UX: "Printer errors show a clear retry prompt, not a silent failure."
 * A job is only reported as printed once the transport accepted it.
 */
export function usePrinting() {
  const { paperWidth, receiptMode, kotMode, receiptPrinter, kotPrinter } = useAppData()
  const toast = useToast()

  const [staged, setStaged] = useState(null) // {kind, payload}
  const [failure, setFailure] = useState(null) // {kind, payload, message, transport}
  const [printing, setPrinting] = useState(false)

  const optionsFor = useCallback(
    (kind) =>
      kind === 'kot'
        ? { transport: kotMode, printerName: kotPrinter, paperWidth }
        : { transport: receiptMode, printerName: receiptPrinter, paperWidth },
    [kotMode, kotPrinter, receiptMode, receiptPrinter, paperWidth]
  )

  const print = useCallback(
    async (kind, payload, { silent = false } = {}) => {
      if (!payload) return { ok: false, message: 'Nothing to print.' }
      setPrinting(true)
      setStaged({ kind, payload })

      // Let React paint the staging DOM before window.print() reads it.
      await new Promise((resolve) => setTimeout(resolve, 60))

      try {
        const result = await printerService.print(kind, payload, optionsFor(kind))
        setFailure(null)
        if (!silent && result.transport !== 'none') {
          toast.success(kind === 'kot' ? 'KOT sent to the kitchen printer.' : 'Receipt printed.')
        }
        return result
      } catch (error) {
        // Never claim success on a failed submission.
        setFailure({
          kind,
          payload,
          message: error.message || 'The printer did not accept the job.',
          transport: error.transport,
          retryable: error.retryable !== false,
        })
        return { ok: false, message: error.message }
      } finally {
        setPrinting(false)
      }
    },
    [optionsFor, toast]
  )

  const retry = useCallback(async () => {
    if (!failure) return
    const { kind, payload } = failure
    setFailure(null)
    await print(kind, payload)
  }, [failure, print])

  const dialog = (
    <Modal
      open={Boolean(failure)}
      onClose={() => setFailure(null)}
      title="Printing failed"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => setFailure(null)}>
            Skip printing
          </Button>
          {failure?.retryable !== false && (
            <Button icon={<IconPrint className="h-4 w-4" />} onClick={retry} loading={printing} data-autofocus>
              Retry print
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-100 text-red-600">
          <IconAlert className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">
            {failure?.kind === 'kot' ? 'The KOT did not print.' : 'The receipt did not print.'}
          </p>
          <p className="mt-1 text-sm text-ink-600">{failure?.message}</p>
          <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-600">
            The sale itself is saved. Fix the printer and retry, or skip and reprint later from
            the bill history.
          </p>
        </div>
      </div>
    </Modal>
  )

  const success = (
    <span className="sr-only" aria-live="polite">
      {printing ? 'Printing…' : ''}
    </span>
  )

  return { print, printing, staged, failure, dialog, success, clearFailure: () => setFailure(null) }
}

export function PrintOkIcon() {
  return <IconCheck className="h-4 w-4" />
}

export default usePrinting
