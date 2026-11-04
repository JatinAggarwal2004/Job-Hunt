import type { Job, Resume } from '../shared/types.ts'
import type { JobResumeReview, GroundedResponse } from '../shared/matching.ts'
import { passages, words } from './job-review.ts'
import { cosine } from './semantic.ts'
type Encoder = (texts: string[], scope: string) => Promise<number[][]>
export async function semanticReviews(
  uid: string,
  job: Job,
  resumes: Resume[],
  reviews: JobResumeReview[],
  encode: Encoder,
) {
  const jobTerms = new Set(words(job.title + '\n' + job.description))
  const titleTerms = new Set(words(job.title))
  const windows = (text: string, terms: Set<string>, requirements = false) =>
    passages(text)
      .map((quote, index) => ({
        quote,
        index,
        score:
          words(quote).filter((t) => terms.has(t)).length +
          (requirements
            ? (
                quote.match(
                  /required|qualifications?|responsibilities|requirements?|skills|experience/gi,
                ) || []
              ).length * 3
            : 0),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 4)
      .sort((a, b) => a.index - b.index)
      .map((p) => p.quote)
  const jobPassages = windows(job.title + '\n' + job.description, titleTerms, true)
  if (!jobPassages.length) return reviews
  const resumePassages = resumes.map((r) => windows(r.text, jobTerms))
  const texts = [...jobPassages, ...resumePassages.flat()]
  const vectors = await encode(texts, uid)
  let cursor = jobPassages.length
  return reviews.map((review, i) => {
    const own = vectors.slice(cursor, cursor + resumePassages[i].length)
    cursor += own.length
    if (!own.length || review.score === null) return review
    const evidence = jobPassages.map((jobQuote, j) => {
      const scores = own.map((v) => cosine(vectors[j], v))
      const best = scores.indexOf(Math.max(...scores))
      return {
        jobQuote,
        resumeQuote: resumePassages[i][best],
        similarity: Math.max(0, Math.min(1, scores[best])),
      }
    })
    const similarity = evidence.reduce((n, e) => n + e.similarity, 0) / evidence.length
    const dimension = {
      name: 'Semantic relatedness · MiniLM',
      score: Math.round(similarity * 25),
      max: 25,
      reason:
        'Local open-source sentence embeddings compare related wording in bounded job/resume passages. This is not a calibrated measure of suitability.',
    }
    const dimensions = [...review.dimensions, dimension]
    return {
      ...review,
      engine: 'minilm_evidence' as const,
      score: Math.round(
        (100 * dimensions.reduce((n, d) => n + d.score, 0)) /
          dimensions.reduce((n, d) => n + d.max, 0),
      ),
      dimensions,
      semanticSimilarity: Math.round(similarity * 100),
      semanticEvidence: evidence,
      notice:
        'Evidence rubric plus local quantized all-MiniLM-L6-v2 semantic relatedness. The model runs on this server; resume text is not sent to Hugging Face. This heuristic score is not an ATS result, applicant percentile or hiring probability. Only your selected versions are compared.',
    }
  })
}
export async function semanticContext(
  uid: string,
  question: string,
  context: GroundedResponse,
  encode: Encoder,
): Promise<GroundedResponse> {
  if (!context.evidence.length) return context
  const candidates = context.evidence.slice(0, 31)
  const vectors = await encode([question, ...candidates.map((e) => e.quote)], uid)
  const evidence = candidates
    .map((e, i) => ({ e, score: cosine(vectors[0], vectors[i + 1]) }))
    .filter(({ score }) => score >= 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ e }, i) => ({ ...e, id: `S${i + 1}` }))
  return {
    ...context,
    candidateOnly: false,
    evidence,
    engine: 'minilm_retrieval',
    answer: evidence.length
      ? `I found source passages in ${new Set(evidence.map((e) => e.jobId)).size} of your eligible openings. These are ranked by semantic relatedness to your question; review the excerpts and employer requirements below.`
      : 'No sufficiently related source passages were found in your eligible openings. Try a role, skill or requirement, or run discovery for your chosen direction.',
    notice:
      'BM25 retrieval with local all-MiniLM-L6-v2 semantic re-ranking over a bounded candidate set. The answer is an extractive summary, not generated reasoning. No resume was included in this job search.',
  }
}
