import { SignIn } from '@clerk/nextjs'
import React from 'react'
import { ROUTES } from '@/lib/constants'

function SignInPage() {
  return (
    <SignIn fallbackRedirectUrl={ROUTES.TWIN} />
  )
}

export default SignInPage