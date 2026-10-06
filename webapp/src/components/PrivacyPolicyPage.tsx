import { Link } from '@tanstack/react-router'

import { PageContainer } from '@/components/PageLayout'
import { Typography } from '@/components/typography'
import { PRIVACY_TEXT, splitTextBlocks } from '@/features/auth'

/** Public page: reachable signed out, from the cookie notice and the registration form. */
export function PrivacyPolicyPage() {
  const { title, paragraphs } = splitTextBlocks(PRIVACY_TEXT)

  return (
    <PageContainer>
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <Typography as="h1" variant="h2">
          {title}
        </Typography>
        {paragraphs.map((paragraph) => (
          <Typography key={paragraph} variant="body">
            {paragraph.replace(/\s*\n\s*/g, ' ')}
          </Typography>
        ))}
        <Typography variant="bodySm">
          <Link className="underline underline-offset-4" search={{ returnTo: undefined }} to="/">
            На главную
          </Link>
        </Typography>
      </div>
    </PageContainer>
  )
}
