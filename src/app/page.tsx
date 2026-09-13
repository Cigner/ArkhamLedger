import { redirect } from 'next/navigation'

/**
 * Root route.
 *
 * The application has no public landing page; the entry point is the campaign
 * list, which the proxy redirects to sign-in when there is no session cookie.
 */
export default function HomePage(): never {
  redirect('/campaigns')
}
