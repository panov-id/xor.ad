// The shell's words: the web's own locales (web/src/locales) and the terminal's
// (depth/ink/locales), read in place through the @locales / @ink-locales aliases
// (vite.config.ts), plus the few lines only this shell has (APP below).
import { byLang, capital, chooseLanguage, chosenLanguage, type Dicts, keepLanguage, languageAsked, languageName, languagesOf, makeSay, pickLanguage } from "./i18n-core";

const depth = byLang(import.meta.glob("@ink-locales/*.json", { eager: true, import: "default" }));
const web = byLang(import.meta.glob("@locales/*.json", { eager: true, import: "default" }));

// Lines the new design has and the web does not (no key to reuse). Russian and
// English; any other language falls back to Russian, as every missing key does.
// Add a language here when it is written for.
// TODO(app.move.*, app.away.*): the other languages are not written; they fall back to Russian until a translator writes them.
export const APP: Dicts = {
  ru: {
    "app.loading.opening": "Открываем район…",
    "app.lang.hint": "Языков: {n}. Потом можно поменять в «Я».",
    "app.reg.sub1": "Соседи видят имя и возраст. Больше ничего.",
    "app.reg.name": "Имя",
    "app.reg.age": "Возраст",
    "app.reg.left": "осталось {n} из {max}",
    "app.reg.next_pin": "Дальше: ПИН",
    "app.reg.pin_title": "ПИН для этого устройства",
    "app.reg.pin_sub": "Шесть цифр. Он открывает приложение только на этом устройстве.",
    "app.reg.easy_pin": "Этот ПИН легко угадать. Можно оставить, но другой надёжнее.",
    "app.reg.create": "Создать меня",
    "app.reg.paper_title": "Бумажный код",
    "app.reg.paper_sub": "Если устройство потеряется, код вернёт вас. У нас его нет.",
    "app.reg.your_code": "Ваш бумажный код",
    "app.reg.paper_note": "Запишите на бумаге. Он показывается один раз.",
    "app.reg.type_group": "Введите группу {n}",
    "app.unlock.title": "С возвращением",
    "app.unlock.sub": "Это устройство вас помнит. Введите ПИН, чтобы открыть.",
    "app.unlock.paper": "Бумажный код",
    "app.unlock.forget_sure": "Стереть с устройства? Нажмите ещё раз",
    "app.locked.title": "Закрыто после 5 минут без вас",
    "app.locked.sub": "Введите ПИН и продолжите с того же места.",
    "app.feed.title": "{place}, рядом",
    "app.feed.err_title": "Сервер не отвечает",
    "app.feed.err_body": "Не получилось загрузить, что говорят соседи. Проверьте связь и попробуйте ещё раз.",
    "app.feed.retry": "Ещё раз",
    "app.feed.empty_hint": "В вашем круге сейчас никто не говорит. Попробуйте круг шире или скажите первым.",
    "app.feed.hidden_gone": "Скрыто · пропало из вашей ленты",
    "app.feed.in_n": "{n} в деле",
    "app.feed.you_too": "вы тоже",
    "app.feed.im_in": "Я в деле",
    "app.feed.hide": "Скрыть",
    "app.feed.block_author": "Заблокировать автора",
    "app.feed.row_going": "Формат",
    "app.feed.row_lang": "Язык",
    "app.feed.row_in": "В деле",
    "app.feed.more_cards": "Показать ещё",
    "app.feed.like_other": "Лайк не принят ({status}).",
    "app.feed.act_failed": "Не получилось: {message}",
    // move and away (w2_departure-*, w2_arrival-*, w2_away). The sheets are English; this Russian is not off a sheet.
    "app.move.out_title": "Перенос на другое устройство",
    "app.move.undone_title": "Это не отменить",
    "app.move.undone_body": "Здесь личность замрёт: новые сообщения перестанут приходить, переписка на этом устройстве станет нечитаемой навсегда — даже если перенести обратно.",
    "app.move.current_pin": "Текущий ПИН",
    "app.move.get_code": "Получить одноразовый код",
    "app.move.type_there": "Наберите на новом устройстве",
    "app.move.lives": "Живёт ещё {m} мин {s} с · срабатывает один раз",
    "app.move.stop": "Остановить",
    "app.move.asks": "Устройство просит вас",
    "app.move.asks_sub": "Проверьте, что четыре символа совпадают с новым устройством.",
    "app.move.yes": "Да, это я",
    "app.move.no": "Нет",
    "app.move.done_title": "Перенесено",
    "app.move.done_body": "Личность теперь живёт на новом устройстве. Это устройство её забыло.",
    "app.move.to_start": "В начало",
    "app.move.in_title": "Перенести личность сюда",
    "app.move.code_title": "Код со старого устройства",
    "app.move.code_sub": "Девять символов. Старое устройство показывает их две минуты.",
    "app.move.next": "Дальше",
    "app.move.check_title": "Сверьте на старом устройстве",
    "app.move.check_sub": "Там должны быть те же четыре символа. Подтвердите на старом устройстве.",
    "app.move.waiting": "Ждём старое устройство…",
    "app.move.confirmed": "Подтверждено. Теперь задайте ПИН для этого устройства.",
    "app.move.new_pin": "Новый ПИН",
    "app.move.repeat_pin": "Повторите ПИН",
    "app.move.done": "Готово",
    "app.move.refused": "Узел отказал ({status}).",
    "app.away.title": "Вы отошли",
    "app.away.sub": "Вернётесь в {time}. Фразы сняты, беседы ждут вас.",
    "app.away.until": "До",
    "app.away.phrases": "Фразы",
    "app.away.phrases_down": "сняты",
    "app.away.talks": "Беседы",
    "app.away.talks_wait": "ждут",
    "app.away.back": "Вернуться",
  },
  en: {
    "app.loading.opening": "Opening the neighborhood…",
    "app.lang.hint": "{n} languages. You can change it later in Me.",
    "app.reg.sub1": "Neighbours see your first name and age. Nothing else.",
    "app.reg.name": "First name",
    "app.reg.age": "Age",
    "app.reg.left": "{n} of {max} left",
    "app.reg.next_pin": "Next: PIN",
    "app.reg.pin_title": "PIN for this device",
    "app.reg.pin_sub": "Six digits. It opens the app on this device only.",
    "app.reg.easy_pin": "This PIN is easy to guess. You can keep it, but a different one is safer.",
    "app.reg.create": "Create me",
    "app.reg.paper_title": "Paper code",
    "app.reg.paper_sub": "If this device is lost, the code brings you back. We don't keep it.",
    "app.reg.your_code": "Your paper code",
    "app.reg.paper_note": "Write it on paper. It is shown once.",
    "app.reg.type_group": "Type group {n}",
    "app.unlock.title": "Welcome back",
    "app.unlock.sub": "This device remembers you. Enter the PIN to open.",
    "app.unlock.paper": "Paper code",
    "app.unlock.forget_sure": "Wipe it off this device? Tap again",
    "app.locked.title": "Locked after 5 minutes away",
    "app.locked.sub": "Enter the PIN to carry on where you were.",
    "app.feed.title": "{place}, nearby",
    "app.feed.err_title": "No answer from the server",
    "app.feed.err_body": "Couldn't load what neighbours say. Check the connection and try again.",
    "app.feed.retry": "Try again",
    "app.feed.empty_hint": "No one in your circle is talking right now. Try a wider circle or say something first.",
    "app.feed.hidden_gone": "Hidden · gone from your feed",
    "app.feed.in_n": "{n} in",
    "app.feed.you_too": "you too",
    "app.feed.im_in": "I'm in",
    "app.feed.hide": "Hide",
    "app.feed.block_author": "Block the author",
    "app.feed.row_going": "Going",
    "app.feed.row_lang": "Language",
    "app.feed.row_in": "In",
    "app.feed.more_cards": "Show more",
    "app.feed.like_other": "The like was not accepted ({status}).",
    "app.feed.act_failed": "Did not work: {message}",
    // move and away: words off the sheets w2_departure-*, w2_arrival-*, w2_away.
    "app.move.out_title": "Move to another device",
    "app.move.undone_title": "This can't be undone",
    "app.move.undone_body": "Here the identity will freeze: new messages stop arriving, the conversations on this device become unreadable for good — even if you move back.",
    "app.move.current_pin": "Current PIN",
    "app.move.get_code": "Get a one-time code",
    "app.move.type_there": "Type this on the new device",
    "app.move.lives": "Lives {m} min {s} s more · works once",
    "app.move.stop": "Stop",
    "app.move.asks": "A device asks for you",
    "app.move.asks_sub": "Check that the four characters match the new device.",
    "app.move.yes": "Yes, it's me",
    "app.move.no": "No",
    "app.move.done_title": "Moved",
    "app.move.done_body": "The identity now lives on the new device. This one forgot it.",
    "app.move.to_start": "To the start",
    "app.move.in_title": "Move the identity here",
    "app.move.code_title": "Code from the old device",
    "app.move.code_sub": "Nine characters. The old device shows them for two minutes.",
    "app.move.next": "Next",
    "app.move.check_title": "Check on the old device",
    "app.move.check_sub": "The same four characters should be there. Confirm it on the old device.",
    "app.move.waiting": "Waiting for the old device…",
    "app.move.confirmed": "Confirmed. Now set a PIN for this device.",
    "app.move.new_pin": "New PIN",
    "app.move.repeat_pin": "Repeat the PIN",
    "app.move.done": "Done",
    "app.move.refused": "The node refused ({status}).",
    "app.away.title": "You stepped away",
    "app.away.sub": "Back at {time}. Your phrases are down, talks are waiting for you.",
    "app.away.until": "Until",
    "app.away.phrases": "Phrases",
    "app.away.phrases_down": "taken down",
    "app.away.talks": "Talks",
    "app.away.talks_wait": "waiting",
    "app.away.back": "Come back",
  },
};

export const LANGUAGES = languagesOf(depth, web);

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const LANG = pickLanguage(LANGUAGES, typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language], chosenLanguage(LANGUAGES, storage()));
if (typeof document !== "undefined") document.documentElement.lang = LANG;

export const say = makeSay(LANG, [depth, web, APP]);
export const nameOf = (lang: string) => languageName(web, lang);
export const asked = () => languageAsked(storage());
/** Keeps the pick from the splash's list; false means the page is reloading in the new language. */
export const keep = (lang: string) => keepLanguage(lang, { languages: LANGUAGES, current: LANG, store: storage(), reload: () => location.reload() });
/** The list's order: the page's own language first, then the rest. */
export const listed = (): string[] => [LANG, ...LANGUAGES.filter((l) => l !== LANG)];
/** A dictionary label as the sheets set it: the first letter in capitals. */
export const label = (key: string, values?: Record<string, string | number>): string => capital(say(key, values), LANG);
