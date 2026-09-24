import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import './reference.css'

const isCapsule = new URLSearchParams(window.location.search).has('capsule')
const isDialog = new URLSearchParams(window.location.search).has('dialog')
const isProjects = new URLSearchParams(window.location.search).has('projects')
const WindowContent = lazy(() => isDialog
  ? import('./components/DialogWindow').then(module => ({default:module.DialogWindow}))
  : isProjects ? import('./components/ProjectsWindow').then(module => ({default:module.ProjectsWindow}))
  : isCapsule ? import('./components/CapsuleWindow').then(module => ({default:module.CapsuleWindow}))
  : import('./App'))
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={null}><WindowContent/></Suspense></React.StrictMode>)
