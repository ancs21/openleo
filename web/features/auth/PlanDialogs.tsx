import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { USAGE_URL, useApp } from "../../stores/app-store";

export function PlanDialogs() {
  const { welcomeOpen, limitOpen, setWelcomeOpen, setLimitOpen } = useApp();
  return (
    <>
      <Modal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} title="You're using your ChatGPT plan"
        actions={<Button variant="primary" value="ok">Got it</Button>}>
        Eligible usage in OpenLeo uses your ChatGPT plan. Manage usage in your{" "}
        <a className="text-accent-ink underline underline-offset-2" href={USAGE_URL} target="_blank" rel="noopener">ChatGPT settings</a>.
      </Modal>
      <Modal open={limitOpen} onClose={() => setLimitOpen(false)} title="Usage limit reached"
        actions={<>
          <Button variant="primary" type="button" onClick={() => window.open(USAGE_URL, "_blank", "noopener")}>Manage usage</Button>
          <Button value="close">Close</Button>
        </>}>
        You've hit a limit on your ChatGPT plan or on OpenLeo's app limit. Review it in ChatGPT settings.
      </Modal>
    </>
  );
}
