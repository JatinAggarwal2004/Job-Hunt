export type ExtractedProfile = {
  resumeId: string
  fields: {
    key: 'name' | 'email' | 'phone' | 'website' | 'linkedin' | 'location'
    value: string
    evidence: string
  }[]
  skills: string[]
  suggestedRoles: string[]
  notice: string
}
export type JobResumeReview = {
  resumeId: string
  filename: string
  score: number | null
  jobId: string
  engine: 'evidence_rules' | 'minilm_evidence'
  semanticSimilarity?: number
  semanticEvidence?: { jobQuote: string; resumeQuote: string; similarity: number }[]
  dimensions: { name: string; score: number; max: number; reason: string }[]
  matchedSkills: { skill: string; jobEvidence: string; resumeEvidence: string }[]
  missingSkills: { skill: string; jobEvidence: string }[]
  relevantPassages: { quote: string; terms: string[] }[]
  suggestions: string[]
  unknowns: string[]
  notice: string
}
export type RetrievedEvidence = {
  id: string
  jobId: string
  title: string
  url: string
  quote: string
}
export type GroundedResponse = {
  candidateOnly?: boolean
  answer: string
  engine: 'retrieval' | 'minilm_retrieval' | 'gemini' | 'ollama'
  evidence: RetrievedEvidence[]
  notice: string
}
export type DeadlineAlert = {
  id: string
  jobId: string
  title: string
  company: string
  url: string
  deadlineAt: string
  remindAt: string
  emailEnabled: boolean
  sentAt: string | null
  readAt: string | null
  due: boolean
  error: string | null
  provenance: 'employer' | 'user'
}
