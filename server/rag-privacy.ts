import type { GroundedResponse } from '../shared/matching.ts'
const email = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi
const phone = /(?:\+?\d[\d ()-]{7,}\d)/g
const url = /https?:\/\/[^\s<>]+/gi
export function publicJobInput(question: string, context: GroundedResponse) {
  if (
    email.test(question) ||
    /\d[\d ()-]{8,}\d/.test(question) ||
    /\b(my resume|my cv|passport|aadhaar|date of birth|medical history)\b/i.test(question)
  ) {
    email.lastIndex = 0
    throw Object.assign(
      Error(
        'Keep personal details and resumes out of this public-job assistant. Use the local Resume fit review for your document.',
      ),
      { status: 400 },
    )
  }
  email.lastIndex = 0
  const clean = (value: string) =>
    value
      .replace(url, '[link omitted]')
      .replace(email, '[contact omitted]')
      .replace(phone, (match) =>
        match.replace(/\D/g, '').length >= 9 ? '[contact omitted]' : match,
      )
  return {
    question: clean(question).slice(0, 1000),
    evidence: context.evidence.slice(0, 6).map((e) => ({
      id: e.id,
      title: clean(e.title).slice(0, 240),
      quote: clean(e.quote).slice(0, 800),
    })),
  }
}
