import { useEffect, useState } from 'react'

let firebaseAuth
async function loadFirebase() {
  if (!firebaseAuth) firebaseAuth = (async () => {
    const [{ initializeApp }, auth] = await Promise.all([import('firebase/app'), import('firebase/auth')])
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }
    if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) throw new Error('Sign-in is not configured for this deployment. Contact your workspace administrator.')
    return { ...auth, instance: auth.getAuth(initializeApp(config, 'banner-studio-web')) }
  })()
  return firebaseAuth
}

export function useStudioAuth() {
  const [state, setState] = useState({ loading: true, user: null, demo: false, error: '' })
  const [role, setRole] = useState(() => sessionStorage.getItem('studio-demo-role') || 'marketer')
  useEffect(() => {
    let active = true
    let unsubscribe
    async function initialize() {
      try {
        if (import.meta.env.DEV && ['127.0.0.1','localhost','[::1]'].includes(location.hostname)) {
          const response = await fetch('/api/v1/dev/session-info')
          if (response.ok && (await response.json()).demo === true) {
            if (active) setState({ loading:false, user:{demo:true}, demo:true, error:'' })
            return
          }
        }
        const firebase = await loadFirebase()
        if (!active) return
        unsubscribe = firebase.onAuthStateChanged(firebase.instance, (user) => setState({loading:false, user, demo:false, error:''}))
      } catch (error) {
        if (active) setState({ loading:false, user:null, demo:false, error:error.message })
      }
    }
    initialize()
    return () => { active = false; unsubscribe?.() }
  }, [])
  const signIn = async () => {
    setState((previous) => ({...previous,error:''}))
    try {
      const firebase = await loadFirebase()
      await firebase.signInWithPopup(firebase.instance, new firebase.GoogleAuthProvider())
    } catch (error) {
      setState((previous) => ({...previous,error:error.code === 'auth/popup-closed-by-user' ? 'Sign-in was closed. You can try again.' : 'Could not sign in. Check that your account has an invitation and try again.'}))
    }
  }
  const signOut = async () => { const firebase = await loadFirebase(); await firebase.signOut(firebase.instance) }
  return { ...state, role, setRole(value) { if (!['marketer','designer','admin'].includes(value)) return; sessionStorage.setItem('studio-demo-role',value); setRole(value) }, signIn, signOut,
    getToken: async () => state.demo ? null : state.user?.getIdToken(),
    getHeaders: async () => state.demo ? {'X-Studio-Demo-Role':role} : {},
  }
}
