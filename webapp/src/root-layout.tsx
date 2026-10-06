import { Outlet } from '@tanstack/react-router'

import { CookieNotice } from '@/components/CookieNotice'

export function RootLayout() {
  return (
    <>
      <Outlet />
      <CookieNotice />
    </>
  )
}
