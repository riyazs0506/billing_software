import { download, get, post } from './api'

export const backupService = {
  list: () => get('/backup'),
  run: () => post('/backup/run'),
  download: (filename) => download(`/backup/download/${filename}`, null, filename),
}

export default backupService
