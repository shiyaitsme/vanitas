import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { Workspace } from './components/Workspace'

type Theme = 'paper' | 'ink'

export default function App() {
  const [theme, setTheme] = useState<Theme>('paper')
  const [session, setSession] = useState<{ src: string | null; name: string } | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'paper' ? 'ink' : 'paper'))

  return session ? (
    <Workspace
      theme={theme}
      onToggleTheme={toggle}
      imageSrc={session.src}
      fileName={session.name}
      onBack={() => setSession(null)}
    />
  ) : (
    <Home theme={theme} onToggleTheme={toggle} onStart={(src, name) => setSession({ src, name })} />
  )
}
