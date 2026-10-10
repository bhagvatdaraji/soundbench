import { Home } from './Home';
import { MODULES } from './modules';
import { useRoute } from './router';

export function App() {
  const route = useRoute();
  const mod = MODULES.find((m) => m.id === route);
  if (!mod) return <Home />;
  const Screen = mod.Screen;
  return <Screen key={mod.id} />;
}
