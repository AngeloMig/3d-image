import { render } from 'preact';
import { DemoApp } from './DemoApp';
import './demo.css';

render(<DemoApp />, document.getElementById('app')!);
