export default function LoadingState({ label = 'Loading Brightloop', fullScreen = false }) {
  return (
    <div className={`loading-state ${fullScreen ? 'loading-state--screen' : ''}`} role="status" aria-live="polite">
      <span className="loading-mark" aria-hidden="true"><span>B</span></span>
      <span>{label}<span className="loading-dots">...</span></span>
    </div>
  );
}
