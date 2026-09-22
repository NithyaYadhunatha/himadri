import { SignUp } from '@clerk/nextjs'
import React from 'react'
import { ROUTES } from '@/lib/constants'

function SignUpPage() {
  return (
    <SignUp fallbackRedirectUrl={ROUTES.TWIN} />
  )
}

export default SignUpPage