import { Link } from '@tanstack/react-router'

import { PageContainer } from '@/components/PageLayout'
import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
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
        <div className="flex justify-center pt-2">
          <Button asChild className="h-11 min-w-40" size="lg" variant="outline">
            <Link search={{ returnTo: undefined }} to="/">
              На главную
            </Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  )
}
