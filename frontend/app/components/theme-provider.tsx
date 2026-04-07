import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "dark", // ⚡ default dark mode
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  // 1️⃣ Initialize with default theme only (no localStorage)
  const [theme, setThemeState] = useState<Theme>(defaultTheme)

  // 2️⃣ Sync with localStorage / system theme in the browser
  useEffect(() => {
    // read from localStorage only in the browser
    const storedTheme = localStorage.getItem(storageKey) as Theme | null
    const appliedTheme = storedTheme || defaultTheme
    setThemeState(appliedTheme)

    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    if (appliedTheme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(appliedTheme)
    }
  }, [defaultTheme, storageKey])

  const setTheme = (newTheme: Theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, newTheme)
      const root = window.document.documentElement
      root.classList.remove("light", "dark")
      if (newTheme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        root.classList.add(systemTheme)
      } else {
        root.classList.add(newTheme)
      }
    }
    setThemeState(newTheme)
  }

  return (
    <ThemeProviderContext.Provider {...props} value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (!context) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
