import { render } from 'preact';
import { DemoApp } from './DemoApp';
import '@fontsource-variable/geist';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/600.css';
import '@fontsource/assistant/700.css';
import './demo.css';

render(<DemoApp />, document.getElementById('app')!);
