// The audit trail now lives in the Trust Center (ledger explorer + on-demand
// chain verification). Keep the old URL working.
import { redirect } from 'next/navigation'

export default function AuditPage() {
  redirect('/trust')
}
