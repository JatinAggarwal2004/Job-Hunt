// This function is serialized by Chrome. Keep it self-contained and pure with respect to network/storage.
export function fillContactFields(profile) {
  const values = {
    name: profile.name,
    given: profile.name?.split(/\s+/)[0],
    family: profile.name?.split(/\s+/).slice(1).join(' '),
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedin: profile.linkedin,
    website: profile.website,
  }
  const autocomplete = {
    name: 'name',
    'given-name': 'given',
    'family-name': 'family',
    email: 'email',
    tel: 'phone',
  }
  const patterns = [
    ['given', /^(first name|given name)$/i],
    ['family', /^(last name|family name|surname)$/i],
    ['name', /^(full name|your name|name)$/i],
    ['email', /^(e[- ]?mail|e[- ]?mail address|your e[- ]?mail)$/i],
    ['phone', /^(phone|phone number|telephone|mobile|mobile number)$/i],
    ['linkedin', /^(linkedin|linkedin url|linkedin profile|linkedin profile url)$/i],
    ['website', /^(website|personal website|portfolio|portfolio url|website url)$/i],
    ['location', /^(current location|location|city and country)$/i],
  ]
  let filled = 0,
    skipped = 0
  for (const field of document.querySelectorAll('input')) {
    if (
      !(field instanceof HTMLInputElement) ||
      !['text', 'email', 'tel', 'url', 'search'].includes(field.type)
    )
      continue
    if (field.disabled || field.readOnly || field.value || !field.getClientRects().length) {
      skipped++
      continue
    }
    const label =
      [...(field.labels || [])]
        .map((l) => l.textContent || '')
        .join(' ')
        .trim()
        .replace(/[\s*：:]+$/g, '') ||
      field.getAttribute('aria-label') ||
      ''
    let key = autocomplete[field.autocomplete]
    if (!key) key = patterns.find(([, pattern]) => pattern.test(label))?.[0]
    const value = key && values[key]
    if (typeof value !== 'string' || !value.trim()) {
      skipped++
      continue
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    filled++
  }
  return { filled, skipped }
}
