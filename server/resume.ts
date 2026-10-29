import { randomUUID } from 'node:crypto'
import type { Analysis, Profile, Suggestion } from '../shared/types.ts'
export function analyze(text: string, profile: Profile, jobText = ''): Analysis {
  const lower = text.toLowerCase()
  const words = text.split(/\s+/).filter(Boolean).length
  const vocabulary = [
    'JavaScript',
    'TypeScript',
    'React',
    'Node.js',
    'Python',
    'Java',
    'SQL',
    'PostgreSQL',
    'MongoDB',
    'Docker',
    'Kubernetes',
    'AWS',
    'Azure',
    'GCP',
    'Figma',
    'Git',
    'GraphQL',
    'Go',
    'Rust',
    'C++',
    'HTML',
    'CSS',
    'Excel',
    'Tableau',
    'Power BI',
    'TensorFlow',
    'PyTorch',
    'Next.js',
    'Redis',
    'Spring',
    'Django',
    'FastAPI',
    'Linux',
    'CI/CD',
  ]
  const required = jobText
    ? [...new Set([...profile.skills, ...vocabulary])].filter((s) => hasSkill(jobText, s))
    : profile.skills
  const matchedSkills = required.filter((s) => hasSkill(text, s))
  const missingSkills = required.filter((s) => !hasSkill(text, s))
  const dimensions = [
    {
      name: 'Contact information',
      score:
        (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text) ? 10 : 0) +
        (/(?:\+?\d[\d ()-]{8,}\d)/.test(text) ? 5 : 0),
      max: 15,
      reason: 'Checks for an email address and a phone number.',
    },
    {
      name: 'Structure',
      score:
        ['experience', 'education', 'skills', 'projects'].filter((s) => lower.includes(s)).length *
        5,
      max: 20,
      reason: 'Looks for experience, education, skills and projects headings.',
    },
    {
      name: 'Evidence of impact',
      score: Math.min(
        25,
        (
          text.match(
            /\b\d+(?:\.\d+)?\s*(?:%|users\b|customers\b|hours\b|days\b|projects\b|requests\b|million\b|ms\b)/gi,
          ) || []
        ).length * 5,
      ),
      max: 25,
      reason: 'Counts measurable outcomes; metrics must be truthful.',
    },
    {
      name: 'Length and readability',
      score: words >= 150 && words <= 900 ? 20 : words >= 80 && words <= 1200 ? 10 : 0,
      max: 20,
      reason: `${words} words; this heuristic favors 150–900 words, not a universal rule.`,
    },
    {
      name: 'Selected skill coverage',
      score: required.length ? Math.round((matchedSkills.length / required.length) * 20) : 0,
      max: 20,
      reason: required.length
        ? 'Literal coverage of profile skills relevant to the selected role.'
        : 'Add skills to your profile to assess coverage.',
    },
  ]
  const suggestions: Suggestion[] = []
  const phrase = text.match(/responsible for ([^\n.]+)/i)
  if (phrase)
    suggestions.push({
      id: randomUUID(),
      title: 'Use a direct action phrase',
      detail: 'Review whether this wording accurately describes your contribution.',
      before: phrase[0],
      after: `Contributed to ${phrase[1]}`,
      status: 'pending',
      category: 'clarity',
    })
  if (missingSkills.length)
    suggestions.push({
      id: randomUUID(),
      title: 'Check missing skill evidence',
      detail: `If accurate, add evidence for: ${missingSkills.join(', ')}. Never claim a skill you do not have.`,
      before: '',
      after: '',
      status: 'pending',
      category: 'skills',
    })
  if (dimensions[2].score < 15)
    suggestions.push({
      id: randomUUID(),
      title: 'Add measurable outcomes',
      detail:
        'For a relevant accomplishment, explain the action, scope and verified outcome. Edit your resume manually; no numbers have been invented.',
      before: '',
      after: '',
      status: 'pending',
      category: 'impact',
    })
  const score = dimensions.reduce((n, d) => n + d.score, 0)
  return {
    score,
    label:
      score >= 75
        ? 'Strong foundation'
        : score >= 45
          ? 'Room to strengthen'
          : 'Needs more evidence',
    engine: 'rules',
    dimensions,
    matchedSkills,
    missingSkills,
    suggestions,
    notice:
      'A transparent writing checklist, not an ATS score, hiring prediction, or assessment of your ability. Formatting cannot be assessed from extracted text. No external AI service was used.',
  }
}

export function hasSkill(text: string, skill: string) {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('(^|[^a-z0-9])' + escaped + '(?=$|[^a-z0-9])', 'i').test(text)
}
