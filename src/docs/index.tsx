import '../index.css';
import './docs.css';
import { render } from 'solid-js/web';
import { initializeTheme } from '../theme';
import { TemplateDocs } from './TemplateDocs';

initializeTheme();
render(() => <TemplateDocs />, document.getElementById('root')!);
