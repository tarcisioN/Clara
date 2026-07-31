import {
  NEWMAN_INSTALL_COMMAND,
  NEWMAN_MISSING_HINTS
} from '../newman/missing.ts';
import './NewmanMissingGuide.css';

type NewmanMissingGuideProps = {
  compact?: boolean;
};

export default function NewmanMissingGuide({ compact = false }: NewmanMissingGuideProps) {
  return (
    <div className={`newman-missing ${compact ? 'compact' : ''}`} role="alert">
      <strong>Newman is not installed</strong>
      <ol>
        {NEWMAN_MISSING_HINTS.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ol>
      <p className="newman-missing-cmd">
        <code>{NEWMAN_INSTALL_COMMAND}</code>
      </p>
    </div>
  );
}
