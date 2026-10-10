import { Home } from './Home';
import { MODULES, SETTINGS_MODULES } from './modules';
import { useRoute } from './router';

export function App() {
  const route = useRoute();
  const mod = [...MODULES, ...SETTINGS_MODULES].find((m) => m.id === route && m.Screen);
  if (!mod?.Screen) return <Home />;
  const Screen = mod.Screen;
  return <Screen key={mod.id} />;
}
