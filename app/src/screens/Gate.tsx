// The gates after the splash (register, restore, arrival) are not moved into this shell yet:
// each is a titled stand-in with a way back, so the splash's buttons lead somewhere and Back works.
import { say } from "../i18n";
import { Screen } from "../shell/Screen";

const WORDS = { register: "web.splash.start", restore: "web.splash.haveCode", arrival: "web.splash.arrive" } as const;

export function Gate({ at, onBack }: { at: keyof typeof WORDS; onBack: () => void }) {
  return (
    <Screen name={at} title={say(WORDS[at])} className="stub">
      <div className="col">
        <h1>{say(WORDS[at])}</h1>
        <button type="button" className="link" onClick={onBack} data-testid={`${at}-back`}>{say("common.back")}</button>
      </div>
    </Screen>
  );
}
