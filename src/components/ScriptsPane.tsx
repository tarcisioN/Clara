import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import type { PostmanScriptListen } from '../postman/scripts.ts';
import './ScriptsPane.css';

type ScriptsPaneProps = {
  listen: PostmanScriptListen;
  source: string;
  onChange: (source: string) => void;
};

const COPY: Record<
  PostmanScriptListen,
  { title: string; hint: string; placeholder: string }
> = {
  prerequest: {
    title: 'Pre-request',
    hint: 'Runs before the request (Postman listen: prerequest). Stored on item.event[].',
    placeholder: '// pm.environment.set("token", "…");'
  },
  test: {
    title: 'Tests',
    hint: 'Runs after the response (Postman listen: test). Stored on item.event[].',
    placeholder: '// pm.test("status is 200", () => {\n//   pm.response.to.have.status(200);\n// });'
  }
};

export default function ScriptsPane({ listen, source, onChange }: ScriptsPaneProps) {
  const copy = COPY[listen];

  return (
    <section className="scripts-pane">
      <div className="scripts-pane-title">
        <h3>{copy.title}</h3>
      </div>
      <p className="scripts-hint">{copy.hint}</p>
      <CodeMirror
        className="scripts-editor"
        value={source}
        placeholder={copy.placeholder}
        height="100%"
        theme="light"
        extensions={[javascript()]}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          indentOnInput: true
        }}
        onChange={onChange}
        aria-label={copy.title}
      />
    </section>
  );
}
