import { createContext, ReactNode, useContext, useState } from "react";
import { DEFAULT_THEME_ID, Theme, themes } from "../constants/themes";
import { getState, setState } from "../db/database";

type ThemeContextValue = {
  theme: Theme;
  setThemeId: (id: string) => void;
};

function findTheme(id: string | null): Theme {
  return themes.find((t) => t.id === id) ?? themes[0];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes[0],
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    findTheme(getState("pref:themeId") ?? DEFAULT_THEME_ID),
  );

  const setThemeId = (id: string) => {
    setState("pref:themeId", id);
    setTheme(findTheme(id));
  };

  return (
    <ThemeContext.Provider value={{ theme, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
