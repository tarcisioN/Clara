import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import './CodeEditor.css';

// Bundle from node_modules so Electron does not fetch the CDN.
loader.config({ monaco });

export type CodeEditorLanguage = 'javascript' | 'json' | 'text';

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  language?: CodeEditorLanguage;
  placeholder?: string;
  className?: string;
  wrap?: boolean;
};

function toMonacoLanguage(language: CodeEditorLanguage): string {
  if (language === 'javascript') {
    return 'javascript';
  }
  if (language === 'json') {
    return 'json';
  }
  return 'plaintext';
}

export default function CodeEditor({
  value,
  onChange,
  ariaLabel,
  language = 'text',
  placeholder,
  className,
  wrap = false
}: CodeEditorProps) {
  return (
    <div className={`code-editor ${className ?? ''}`.trim()} aria-label={ariaLabel}>
      <Editor
        height="100%"
        language={toMonacoLanguage(language)}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        theme="vs"
        loading={<div className="code-editor-loading">Loading editor…</div>}
        options={{
          automaticLayout: true,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 12,
          lineHeight: 18,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: wrap ? 'on' : 'off',
          tabSize: 2,
          renderLineHighlight: 'line',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
          },
          padding: { top: 8, bottom: 8 },
          folding: false,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 3,
          ariaLabel: placeholder ? `${ariaLabel}. ${placeholder}` : ariaLabel
        }}
      />
    </div>
  );
}
