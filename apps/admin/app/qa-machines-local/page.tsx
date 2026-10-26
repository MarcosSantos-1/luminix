import { notFound } from 'next/navigation'
import QA from './qa-client'

export default function QAMachinesPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <QA />
}
