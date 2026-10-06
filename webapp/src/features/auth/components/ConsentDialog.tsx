import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { splitTextBlocks } from '../consent-text'

/**
 * A legal text (consent or privacy policy), scroll-gated: «Согласен» stays disabled until the text
 * has been read to the end, then ticks its checkbox. The text is static and rendered as plain text,
 * never as HTML. `testId` prefixes the «Согласен» button's test id (`<testId>-agree`).
 */
export function ConsentDialog({
  onAgree,
  onOpenChange,
  open,
  testId = 'consent',
  text,
}: {
  onAgree: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  testId?: string
  text: string
}) {
  const { title, paragraphs } = splitTextBlocks(text)
  const [atEnd, setAtEnd] = useState(false)

  function check(element: HTMLElement) {
    // Within 2px of the bottom counts as the end; a short text that needs no scrolling is read at once.
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 2) setAtEnd(true)
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) setAtEnd(false)
        onOpenChange(next)
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {atEnd ? 'Текст прочитан до конца.' : 'Прокрутите текст до конца, чтобы согласиться.'}
          </DialogDescription>
        </DialogHeader>
        <div
          className="max-h-[50svh] overflow-y-auto pr-2"
          onScroll={(event) => check(event.currentTarget)}
          ref={(element) => {
            if (element) check(element)
          }}
          // A scrollable region must be reachable from the keyboard.
          tabIndex={0}
        >
          <div className="grid gap-3">
            {paragraphs.map((paragraph) => (
              <Typography key={paragraph} variant="bodySm">
                {paragraph.replace(/\s*\n\s*/g, ' ')}
              </Typography>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid={`${testId}-agree`}
            disabled={!atEnd}
            onClick={() => {
              setAtEnd(false)
              onAgree()
            }}
            size="lg"
            type="button"
          >
            Согласен
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
