import { z } from 'zod'
import type { MailSender } from './accounts.ts'

export function httpsMailSender(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
): MailSender | null {
  if (
    env.MAIL_PROVIDER !== 'brevo' ||
    !env.BREVO_API_KEY ||
    !z.string().email().safeParse(env.MAIL_FROM_EMAIL).success
  )
    return null
  return async (mail) => {
    const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY! },
      body: JSON.stringify({
        sender: { email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME || 'Job-Hunter' },
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
      }),
    })
    await response.body?.cancel()
    if (response.status !== 201) throw Error('The email provider could not accept this message.')
  }
}
