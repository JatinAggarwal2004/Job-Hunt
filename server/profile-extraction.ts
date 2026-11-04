import type { Resume } from '../shared/types.ts'
import type { ExtractedProfile } from '../shared/matching.ts'
import { hasSkill } from './resume.ts'
import { roleOptions } from '../shared/profile-options.ts'
export const skillVocabulary = [
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
  'Spring Boot',
  'Django',
  'FastAPI',
  'Linux',
  'CI/CD',
  'REST',
  'Microservices',
  'System Design',
  'Data Analysis',
  'Machine Learning',
  'Communication',
  'Customer Support',
  'Sales',
  'Marketing',
  'SEO',
  'Accounting',
  'Financial Analysis',
  'Project Management',
  'Product Management',
  'User Research',
  'Accessibility',
  'Testing',
  'Selenium',
  'Jest',
  'Playwright',
  'Angular',
  'Vue',
  'Kotlin',
  'Swift',
  'Flutter',
  'Dart',
  'C#',
  '.NET',
  'PHP',
  'Ruby',
  'Rails',
  'Scala',
  'Spark',
  'Hadoop',
  'Kafka',
  'RabbitMQ',
  'Terraform',
  'Ansible',
  'Jenkins',
  'Prometheus',
  'Grafana',
  'Snowflake',
  'Databricks',
  'Pandas',
  'NumPy',
  'Scikit-learn',
  'R',
  'MATLAB',
  'SAP',
  'Salesforce',
  'HubSpot',
  'Canva',
  'Photoshop',
  'Illustrator',
  'Copywriting',
  'Content Marketing',
  'Google Analytics',
  'A/B Testing',
  'Business Analysis',
]
export function extractProfile(resume: Resume): ExtractedProfile {
  const text = resume.text,
    lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  const fields: ExtractedProfile['fields'] = []
  const add = (key: ExtractedProfile['fields'][number]['key'], value?: string) => {
    if (value)
      fields.push({
        key,
        value: value.trim(),
        evidence: lines.find((line) => line.includes(value))?.slice(0, 300) || value,
      })
  }
  const first = lines[0] || ''
  if (
    /^[\p{L} .'-]{3,80}$/u.test(first) &&
    first.split(/\s+/).length >= 2 &&
    !/resume|curriculum|engineer|developer|summary|profile|education|experience/i.test(first)
  )
    add('name', first)
  add('email', text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0])
  const phone = text.match(/(?:\+\d{1,3}[ ()-]*)?(?:\d[ ()-]*){9,14}\d\b/g)?.find((v) => {
    const n = v.replace(/\D/g, '').length
    return n >= 10 && n <= 15 && !/^20\d{2}\s*[-–]/.test(v)
  })
  add('phone', phone)
  const urls = [...text.matchAll(/https?:\/\/[^\s<>"')]+/gi)].map((m) => m[0].replace(/[.,;]$/, ''))
  add(
    'linkedin',
    urls.find((u) => {
      try {
        return /(^|\.)linkedin\.com$/.test(new URL(u).hostname)
      } catch {
        return false
      }
    }),
  )
  add(
    'website',
    urls.find((u) => !/(linkedin\.com|github\.com)/i.test(u)),
  )
  add('location', text.match(/^(?:location|based in|address)\s*:\s*([^\n]{2,100})/im)?.[1])
  return {
    resumeId: resume.id,
    fields,
    skills: skillVocabulary.filter((skill) => hasSkill(text, skill)),
    suggestedRoles: roleOptions.filter((role) => hasSkill(text, role)),
    notice:
      'Extracted from your document text. Review every field before saving. Missing fields are left blank; no experience, dates or achievements were invented.',
  }
}
