import { Link, useLocation } from '@tanstack/react-router'
import { useEffect, useReducer, useState, type CSSProperties } from 'react'

import { Typography } from '@/components/typography'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/features/auth'
import { isScreenViewer, mergePhotos } from '@/features/network'
import { useMediaQuery } from '@/hooks/use-media-query'
import { arrivalCaption, advance, ARRIVAL_MS, flaskIdeaUrl, ingest, initialFlaskState, liquidLevel, restingPosition } from './model'
import { useFlaskQuery } from './queries'

// Drawing space 400×500: neck on top, body below. Everything is flat, in theme colours.
// A laboratory (Erlenmeyer) flask: narrow neck with a rim, a wide cone, rounded base.
const FLASK_PATH = 'M158 52 H242 V175 L345 400 Q360 432 330 448 H70 Q40 432 55 400 L158 175 Z'
const RIM = { x: 144, y: 34, width: 112, height: 20 }
const LIQUID_TOP = 240
const LIQUID_BOTTOM = 448
const NECK_X = 200
const NECK_Y = 80
const BULB_R = 22
const RESTING_R = 15
const BUBBLES = [
  { x: 130, y: 440, r: 6, delay: '0s' },
  { x: 200, y: 450, r: 8, delay: '1.5s' },
  { x: 260, y: 440, r: 5, delay: '3s' },
  { x: 170, y: 455, r: 4, delay: '4.5s' },
  { x: 230, y: 445, r: 6, delay: '2.2s' },
]

/**
 * «Колба идей» for the big portrait display: a flask that fills with the ideas of the participants,
 * a QR code to add one, and a caption for each newcomer. It shows who, never what. It polls the
 * server and keeps the last picture through network errors and a lost session.
 */
export function FlaskScreen() {
  const auth = useAuth()
  const signedIn = isScreenViewer(auth.user?.role)
  const { pathname } = useLocation()
  const query = useFlaskQuery()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [state, dispatch] = useReducer(
    (current: typeof initialFlaskState, action: { ideas: Parameters<typeof ingest>[1] } | 'advance') =>
      action === 'advance' ? advance(current) : ingest(current, action.ideas),
    initialFlaskState,
  )
  const [photos, setPhotos] = useState<ReturnType<typeof mergePhotos>>(new Map())
  const [failedPhotos, setFailedPhotos] = useState<ReadonlySet<string>>(new Set())
  const [qr, setQr] = useState<string | null>(null)

  const [photosFrom, setPhotosFrom] = useState(query.data)
  if (query.data && query.data !== photosFrom) {
    setPhotosFrom(query.data)
    setPhotos(
      mergePhotos(
        photos,
        query.data.ideas.map((idea) => ({ id: idea.id, photo: idea.participant.photo })),
        query.dataUpdatedAt,
      ),
    )
  }

  useEffect(() => {
    if (query.data) dispatch({ ideas: query.data.ideas })
  }, [query.data])

  const currentId = state.current?.idea.id
  useEffect(() => {
    if (!currentId) return
    const timer = window.setTimeout(() => dispatch('advance'), ARRIVAL_MS)
    return () => window.clearTimeout(timer)
  }, [currentId])

  useEffect(() => {
    let cancelled = false
    // Loaded on demand, like the participant's own QR.
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(flaskIdeaUrl(window.location.origin), { width: 512, margin: 1 }))
      .then((src) => !cancelled && setQr(src))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const total = query.data?.total ?? 0
  const surface = LIQUID_BOTTOM - liquidLevel(total) * (LIQUID_BOTTOM - LIQUID_TOP)
  const status = !signedIn ? 'session' : query.isError ? 'offline' : null
  const current = state.current
  const currentTarget = current ? restingPosition(current.slot) : null
  const photoFor = (id: string) => {
    const url = photos.get(id)?.url
    return url && !failedPhotos.has(url) ? url : null
  }
  const currentPhoto = current ? photoFor(current.idea.id) : null

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background" data-testid="flask-screen">
      <div className="grid gap-1 px-6 pt-8">
        <Typography align="center" variant="h1">
          Колба Идей
        </Typography>
        <Typography align="center" data-testid="flask-total" tone="muted" variant="h4">
          Идей в колбе: {total}
        </Typography>
      </div>
      <div className="relative min-h-0 flex-1">
        <svg
          aria-label="Колба идей"
          className="size-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox="0 0 400 500"
        >
          <defs>
            <clipPath id="flask-body-clip">
              <path d={FLASK_PATH} />
            </clipPath>
            <clipPath id="flask-photo-clip">
              <circle r={BULB_R} />
            </clipPath>
            <clipPath id="flask-resting-clip">
              <circle r={RESTING_R} />
            </clipPath>
          </defs>
          <path className="fill-secondary" d={FLASK_PATH} />
          <g clipPath="url(#flask-body-clip)">
            <rect
              className="fill-chart-3 transition-transform duration-1000 ease-out"
              height="500"
              style={{ transform: `translateY(${surface.toFixed(1)}px)` }}
              width="400"
            />
            {BUBBLES.map((bubble) => (
              <circle
                className="animate-flask-bubble fill-background motion-reduce:hidden"
                cx={bubble.x}
                cy={bubble.y}
                key={bubble.delay}
                r={bubble.r}
                style={{ animationDelay: bubble.delay }}
              />
            ))}
            {state.resting.map(({ idea, slot }) => {
              const { x, y } = restingPosition(slot)
              const photo = photoFor(idea.id)
              return (
                <g data-testid="flask-bulb" key={idea.id} transform={`translate(${x} ${y})`}>
                  <rect className="fill-brand" height="5" rx="1.5" width="9" x="-4.5" y={RESTING_R - 3} />
                  <circle className="fill-background" r={RESTING_R} />
                  {photo ? (
                    <image
                      aria-hidden
                      clipPath="url(#flask-resting-clip)"
                      height={RESTING_R * 2}
                      href={photo}
                      onError={() => setFailedPhotos((failed) => new Set(failed).add(photo))}
                      preserveAspectRatio="xMidYMid slice"
                      width={RESTING_R * 2}
                      x={-RESTING_R}
                      y={-RESTING_R}
                    />
                  ) : (
                    <text
                      className="fill-foreground"
                      dominantBaseline="central"
                      fontSize={12}
                      fontWeight={700}
                      textAnchor="middle"
                    >
                      {idea.participant.initials}
                    </text>
                  )}
                  <circle className="fill-none stroke-highlight" r={RESTING_R} strokeWidth="2" />
                </g>
              )
            })}
          </g>
          <path className="fill-none stroke-brand" d={FLASK_PATH} strokeLinejoin="round" strokeWidth="6" />
          <rect className="fill-secondary stroke-brand" height={RIM.height} rx="8" strokeWidth="6" width={RIM.width} x={RIM.x} y={RIM.y} />
          {current && currentTarget && (
            <g key={current.idea.id} transform={`translate(${NECK_X} ${NECK_Y})`}>
              <g
                className={reducedMotion ? undefined : 'animate-flask-drop'}
                data-testid="flask-drop"
                style={
                  {
                    '--drop-dx': `${currentTarget.x - NECK_X}px`,
                    '--drop-dy': `${currentTarget.y - NECK_Y}px`,
                    ...(reducedMotion ? { transform: `translate(${currentTarget.x - NECK_X}px, ${currentTarget.y - NECK_Y}px) scale(0.5)` } : {}),
                  } as CSSProperties
                }
              >
                <g className={reducedMotion ? 'animate-flask-fade' : undefined}>
                  <rect className="fill-brand" height="9" rx="3" width="18" x="-9" y={BULB_R - 6} />
                  <circle className="fill-background" r={BULB_R} />
                  {currentPhoto && (
                    <image
                      aria-hidden
                      clipPath="url(#flask-photo-clip)"
                      height={BULB_R * 2}
                      href={currentPhoto}
                      onError={() => setFailedPhotos((failed) => new Set(failed).add(currentPhoto))}
                      preserveAspectRatio="xMidYMid slice"
                      width={BULB_R * 2}
                      x={-BULB_R}
                      y={-BULB_R}
                    />
                  )}
                  <circle className="fill-none stroke-highlight" r={BULB_R} strokeWidth="3" />
                  {!currentPhoto && (
                    <text
                      className="fill-foreground"
                      dominantBaseline="central"
                      fontSize={16}
                      fontWeight={700}
                      textAnchor="middle"
                    >
                      {current.idea.participant.initials}
                    </text>
                  )}
                </g>
              </g>
            </g>
          )}
        </svg>

        {current && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 grid justify-items-center px-4">
            <div
              className="animate-flask-caption rounded-md bg-primary px-6 py-3"
              data-testid="flask-caption"
              key={current.idea.id}
            >
              <Typography align="center" className="text-primary-foreground" variant="h1">
                {arrivalCaption(current.idea)}
              </Typography>
            </div>
          </div>
        )}
        {query.data === undefined && status === null && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 p-6">
        {qr && <img alt="QR-код: добавить идею" className="size-40 rounded-lg bg-white md:size-56" data-testid="flask-qr" src={qr} />}
        <div className="grid gap-2">
          <Typography variant="h1">Добавить идею</Typography>
          <Typography tone="muted" variant="lead">
            Наведите камеру телефона на QR-код
          </Typography>
        </div>
      </div>

      {status && (
        <div
          className="absolute right-4 bottom-4 flex items-center gap-2 rounded-md bg-background/80 px-3 py-2"
          data-testid="flask-status"
          role="status"
        >
          {status === 'session' ? (
            <Typography asChild tone="muted" variant="caption">
              <Link search={{ returnTo: pathname }} to="/login">
                Сессия истекла · войти снова
              </Link>
            </Typography>
          ) : (
            <Typography tone="muted" variant="caption">
              Нет связи с сервером
            </Typography>
          )}
        </div>
      )}
    </div>
  )
}
