export const experienceOptions = ['Internship', 'Entry level', 'Mid level', 'Senior', 'Lead']
export const roleOptions = [
  'Software Engineer',
  'Frontend Engineer',
  'Backend Engineer',
  'Full Stack Developer',
  'Mobile Developer',
  'Data Analyst',
  'Data Scientist',
  'Machine Learning Engineer',
  'DevOps Engineer',
  'QA Engineer',
  'Product Designer',
  'Product Manager',
  'Business Analyst',
  'Marketing Specialist',
  'Sales Associate',
  'Customer Support',
]
export const locationOptions = [
  'India',
  'Bengaluru',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi NCR',
  'Gurugram',
  'Noida',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Kochi',
  'Indore',
  'Chandigarh',
  'Coimbatore',
  'Worldwide',
  'Singapore',
  'United Kingdom',
  'United States',
  'Canada',
  'Germany',
  'Australia',
]
export const skillOptions = [
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'Java',
  'Python',
  'SQL',
  'Git',
  'HTML',
  'CSS',
  'Communication',
  'Problem solving',
  'Excel',
  'Figma',
]
const skillGroups: [RegExp, string[]][] = [
  [
    /frontend|front.end|full.stack|web/i,
    ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Accessibility'],
  ],
  [/backend|software|full.stack/i, ['Java', 'Python', 'Node.js', 'SQL', 'REST APIs', 'Git']],
  [
    /data|machine.learning|analyst/i,
    ['Python', 'SQL', 'Excel', 'Statistics', 'Power BI', 'Machine Learning'],
  ],
  [/design/i, ['Figma', 'User research', 'Prototyping', 'Interaction design', 'Accessibility']],
  [/devops|cloud/i, ['Linux', 'Docker', 'Kubernetes', 'CI/CD', 'AWS']],
  [/qa|test/i, ['Test automation', 'Playwright', 'API testing', 'SQL']],
  [/product.manager|business/i, ['Product discovery', 'Analytics', 'Communication', 'SQL']],
  [/marketing|sales|support/i, ['Communication', 'CRM', 'Customer research', 'Excel']],
  [/mobile/i, ['React Native', 'Kotlin', 'Swift', 'TypeScript']],
]
export const uniqueChoices = (values: string[]) =>
  [
    ...new Map(
      values
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => [v.toLowerCase(), v.slice(0, 100)]),
    ).values(),
  ].slice(0, 50)
export function suggestedSkills(roles: string[]) {
  return uniqueChoices(
    skillGroups
      .filter(([pattern]) => roles.some((role) => pattern.test(role)))
      .flatMap(([, skills]) => skills),
  )
}
