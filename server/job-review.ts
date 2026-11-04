import type { Job, Profile, Resume } from '../shared/types.ts'
import type { JobResumeReview } from '../shared/matching.ts'
import { hasSkill } from './resume.ts'
import { skillVocabulary } from './profile-extraction.ts'
const stopWords = new Set([
  'the',
  'and',
  'with',
  'for',
  'that',
  'this',
  'from',
  'your',
  'you',
  'are',
  'our',
  'will',
  'have',
  'has',
  'work',
  'job',
  'their',
  'all',
  'can',
  'not',
  'was',
  'but',
  'into',
  'about',
  'what',
  'how',
  'why',
  'which',
  'there',
  'they',
  'who',
  'should',
  'would',
  'could',
  'please',
  'find',
  'show',
  'jobs',
  'resume',
])
export const words = (text: string) =>
  [...new Set(text.toLowerCase().match(/[\p{L}\p{N}+#.]{2,}/gu) || [])].filter(
    (w) => !stopWords.has(w),
  )
export function passages(text: string) {
  const result: string[] = []
  const clean = text.replace(/\r/g, '').trim()
  for (let at = 0; at < Math.min(clean.length, 30000); at += 650) {
    result.push(clean.slice(at, at + 800))
    if (result.length === 40) break
  }
  return result
}
const excerpt = (text: string, term: string) => {
  const at = text.toLowerCase().indexOf(term.toLowerCase())
  return at < 0
    ? ''
    : text
        .slice(Math.max(0, at - 70), Math.min(text.length, at + term.length + 150))
        .replace(/\s+/g, ' ')
        .trim()
}
export function reviewResume(resume: Resume, job: Job, profile: Profile): JobResumeReview {
  const skills = [...new Set([...profile.skills, ...skillVocabulary])]
    .filter((s) => hasSkill(job.description, s))
    .slice(0, 60)
  const matched = skills.filter((s) => hasSkill(resume.text, s)),
    missing = skills.filter((s) => !hasSkill(resume.text, s))
  const terms = words(job.title + ' ' + job.description),
    chunks = passages(resume.text)
  const relevantPassages = chunks
    .map((quote) => ({ quote, terms: terms.filter((t) => hasSkill(quote, t)) }))
    .filter((p) => p.terms.length >= 2)
    .sort((a, b) => b.terms.length - a.terms.length)
    .slice(0, 3)
  const coverage = skills.length ? Math.round((50 * matched.length) / skills.length) : 0
  const termHits = terms.filter((t) => hasSkill(resume.text, t)).length
  const relevance = terms.length
    ? Math.round(35 * Math.min(1, termHits / Math.max(8, terms.length * 0.35)))
    : 0
  const structure = ['experience', 'projects', 'education', 'skills'].filter((t) =>
    hasSkill(resume.text, t),
  ).length
  const dimensions = [
    {
      name: 'Job skill evidence',
      score: coverage,
      max: skills.length ? 50 : 0,
      reason: skills.length
        ? `${matched.length} of ${skills.length} recognised skills mentioned in this job appear in this resume. Mention does not prove proficiency or make every skill mandatory.`
        : 'No supported skill terms detected; this dimension is unassessed.',
    },
    {
      name: 'Relevant document evidence',
      score: relevance,
      max: terms.length ? 35 : 0,
      reason:
        'Overlap between job terms and actual document passages. Repetition adds no credit; this is lexical evidence, not semantic understanding.',
    },
    {
      name: 'Readable structure',
      score: Math.round((15 * structure) / 4),
      max: 15,
      reason: `${structure} of 4 common section labels found. This is not an assessment of PDF layout.`,
    },
  ]
  const assessed = dimensions.reduce((n, d) => n + d.max, 0)
  const unknowns = [
    'Work authorization, employer preferences and interview performance are not assessed.',
  ]
  if (!skills.length) unknowns.push('Skill coverage could not be assessed for this job vocabulary.')
  const years = job.description.match(
    /\b(?:minimum|at least|require\w*)\b[\s\S]{0,100}?(\d{1,2})\+?\s+years?\s+(?:of\s+)?experience/i,
  )
  if (years)
    unknowns.push(
      `The job mentions at least ${years[1]} years of experience. Verify dates and eligibility yourself; resume timelines are not assumed.`,
    )
  return {
    resumeId: resume.id,
    filename: resume.filename,
    jobId: job.id,
    score:
      !job.description.trim() || resume.text.trim().length < 40
        ? null
        : Math.round((100 * dimensions.reduce((n, d) => n + d.score, 0)) / assessed),
    engine: 'evidence_rules',
    dimensions,
    matchedSkills: matched.map((skill) => ({
      skill,
      jobEvidence: excerpt(job.description, skill),
      resumeEvidence: excerpt(resume.text, skill),
    })),
    missingSkills: missing.map((skill) => ({
      skill,
      jobEvidence: excerpt(job.description, skill),
    })),
    relevantPassages,
    suggestions: [
      ...(missing.length
        ? [
            `If you have genuine experience with ${missing.slice(0, 8).join(', ')}, add a concrete example. Otherwise leave those skills out.`,
          ]
        : []),
      ...(relevantPassages.length
        ? [
            'Move your most relevant project or accomplishment closer to the top; preserve its facts.',
          ]
        : ['Add a relevant project or achievement with verifiable scope and outcomes.']),
      ...(structure < 3
        ? ['Use clear section labels so readers can find your experience, projects and skills.']
        : []),
    ],
    unknowns,
    notice:
      'Job-specific document evidence score, not an ATS score, candidate percentile or hiring probability. Only your selected account-owned versions are compared. No external model was used for this score.',
  }
}
