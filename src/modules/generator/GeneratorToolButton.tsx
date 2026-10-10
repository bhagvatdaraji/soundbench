import { engine, useEngineStatus } from '../../audio/engine';
import { ToolButton } from '../../components/ui';

/** Toolbar shortcut: starts/stops the signal generator with its last settings. */
export function GeneratorToolButton() {
  const { generatorRunning } = useEngineStatus();
  return (
    <ToolButton
      icon="sine"
      label={generatorRunning ? 'Gen on' : 'Generator'}
      active={generatorRunning}
      onClick={() => void engine.setGeneratorRunning(!generatorRunning)}
    />
  );
}
