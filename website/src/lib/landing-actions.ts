/**
 * `PUBLIC_WEBAPP_URL` is build-time configuration read by `src/pages/index.astro`. The unified
 * release always sets it to the web app's `https://` origin, and a local or webapp-less build
 * leaves it unset. A value that is set but is not an absolute http(s) URL is a configuration
 * mistake, so this throws and fails `astro build` instead of shipping a call to action that links
 * nowhere.
 */
export function resolvePublicWebappUrl(value: string | undefined): string | undefined {
  const webappUrl = value?.trim()
  if (!webappUrl) return undefined

  if (!isAbsoluteHttpUrl(webappUrl)) {
    throw new Error(
      `PUBLIC_WEBAPP_URL must be an absolute http(s) URL such as https://app.example.com, got "${webappUrl}". ` +
        'Leave it unset to build the website without a link to the web app.',
    )
  }

  return webappUrl
}

function isAbsoluteHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** The two ways into the product: the sign-in and the registration pages of the web app. */
export function getEntryActions(publicWebappUrl?: string) {
  const webappUrl = resolvePublicWebappUrl(publicWebappUrl)
  if (!webappUrl) return null

  return {
    login: new URL('/login', webappUrl).toString(),
    signup: new URL('/signup', webappUrl).toString(),
  }
}
