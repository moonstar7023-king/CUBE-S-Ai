/* =====================================================================
   CUTE-S AI - Safety layer (safety.js)
   One central gate for ALL AI calls (chat, files, images, videos, coding,
   research, data), whichever model is selected. Changing the model can
   never skip these checks. The rules below are frozen code: admin
   settings can turn models on or off, but cannot remove these checks.

   HONEST LIMITS: this runs in the browser (best effort). A determined
   person can bypass browser code. Real server-side enforcement needs a
   backend (Firebase Cloud Functions) - see UPGRADE-STEPS.md. Generated
   images / videos are not scanned (needs a server or a vision check);
   the provider's own filters still apply. Rules cover English and a few
   Roman-Urdu words; they are not a complete moderation system.
   ===================================================================== */
(function () {
  const S = '(?:nudes?|naked|nudity|porn\\w*|erotic\\w*|explicit|topless|undress\\w*|lingerie|fetish|sexy|sex(?:ual)? (?:scene|story|roleplay|content|video|photo|image|act)s?|sex with|have sex|rape|molest\\w*)';
  const C = '(?:child|children|kid|kids|minor|minors|underage|under ?age|toddler|preteen|pre-teen|teen|teens|teenage|teenager|teenagers|schoolgirl|school ?girl|schoolboy|school ?boy|loli\\w*|shota|little (?:girl|boy)|young (?:girl|boy)|baby|\\d{1,2} ?(?:yo|y/o|year[- ]?old|saal))';
  const code = '(?:code|script|program|tool|payload|source|executable|builder|generator|app|bot|that (?:encrypts|steals|spreads|logs|hides|infects))';
  const mal = '(?:ransomware|keylogger|key logger|spyware|stealerware|stalkerware|credential stealer|password stealer|info ?stealer|botnet|trojan|rootkit|backdoor|malware|computer virus|worm)';

  const RULES = Object.freeze([
    { id: 'child', label: 'Child safety', out: true,
      re: [new RegExp('\\b' + C + '\\b.{0,60}\\b' + S + '\\b', 'i'), new RegExp('\\b' + S + '\\b.{0,60}\\b' + C + '\\b', 'i')],
      msg: 'Sexual content involving children or minors is never allowed, in any form.', alt: null },
    { id: 'nonconsensual', label: 'Non-consensual intimate imagery', out: true,
      re: [/\b(?:undress|nudify|strip)\w*\b.{0,40}\b(?:photo|picture|image|pic|her|him|girl|woman|boy|man|classmate|teacher|friend|celebrity)\b/i,
        /\bdeepfake\b.{0,30}\b(?:porn\w*|nudes?|sex\w*|explicit)\b/i, /\b(?:fake|ai)\b.{0,15}\b(?:nudes?|porn\w*)\b.{0,30}\b(?:of|from)\b/i,
        /\brevenge porn\b/i, /\bleak\w*\b.{0,15}\b(?:nudes?|private (?:photos|videos|pics))\b/i, /\bremove (?:her|his|their|the) clothes\b/i],
      msg: 'Creating or sharing intimate images of a real person without consent is not allowed.', alt: 'I can help with a respectful portrait or a fictional character instead.' },
    { id: 'explicit', label: 'Explicit sexual content', out: true,
      re: [/\b(?:write|generate|create|make|show|draw|give|describe|tell|send)\b.{0,40}\b(?:porn\w*|erotic\w*|nsfw|hentai|explicit sex\w*|sex scene|sexual (?:story|roleplay|content)|nude (?:photo|image|picture|pic|woman|man|girl|boy|body)|naked (?:woman|man|girl|boy|body|people))\b/i,
        /^\s*(?:nsfw|xxx)\b/i, /\b(?:nangi|nanga|chudai|gandi kahani|sex ki kahani)\b/i],
      msg: 'Explicit sexual content is not allowed in CUTE-S AI.', alt: 'I can help with a family-friendly story, a study topic, or a different design.' },
    { id: 'malware', label: 'Malicious software', out: false,
      re: [new RegExp('\\b(?:write|create|make|build|code|develop|generate|give me)\\b.{0,50}\\b' + mal + '\\b.{0,40}\\b' + code + '\\b', 'i'),
        new RegExp('\\b' + mal + '\\b (?:code|script|source|builder|generator)\\b', 'i'),
        /\b(?:ddos|dos)\b (?:script|tool|attack (?:script|tool|code))/i, /\bphishing (?:page|site|website|kit)\b.{0,40}\b(?:bank|login|paypal|facebook|instagram|gmail|whatsapp|easypaisa|jazzcash)\b/i],
      msg: 'I can\'t help create malicious software or attack tools.', alt: 'I can explain how such attacks work in general and how to defend against them.' },
    { id: 'fraud', label: 'Fraud', out: false,
      re: [/\b(?:fake|forged|counterfeit)\b.{0,20}\b(?:id card|passport|driving licen[cs]e|degree|marksheet|transcript|bank statement|cheque|currency|banknote)\b/i,
        /\b(?:carding|cvv dump|credit card generator)\b/i, /\bsteal\b.{0,12}\b(?:credit|card|bank)\b.{0,12}\b(?:data|info|details|numbers)\b/i, /\bscam (?:script|call script|message)s?\b/i],
      msg: 'I can\'t help with fraud, forgery or scams.', alt: 'I can help you recognise scams or write a genuine, honest document.' },
    { id: 'dangerous', label: 'Dangerous instructions', out: false,
      unless: /bath ?bomb|photo ?bomb|sound ?bomb|bomb calorimeter|bomb cyclone/i,
      re: [/\b(?:how to|steps to|instructions? (?:for|to)|recipe for|make|build|synthesi[sz]e|manufacture|prepare|assemble)\b.{0,40}\b(?:bomb|explosives?|pipe bomb|molotov|nerve agent|sarin|ricin|anthrax|bioweapon|chemical weapon|nitroglycerin|tatp|napalm|untraceable gun|ghost gun|3d[- ]printed gun|silencer)\b/i,
        /\bkill\b.{0,20}\b(?:someone|a person|him|her|my (?:teacher|boss|neighbou?r|wife|husband))\b.{0,30}\b(?:without|undetected|get(?:ting)? caught)\b/i, /\bpoison\b.{0,15}\b(?:someone|my (?:teacher|boss|neighbou?r|wife|husband|friend))\b/i],
      msg: 'I can\'t give instructions that could seriously hurt people.', alt: 'I can explain the science or history at a safe, general level.' },
    { id: 'access', label: 'Unauthorized access', out: false,
      re: [/\b(?:hack|crack|break into|bypass|steal|get into|access)\b.{0,40}\b(?:someone'?s|somebody'?s|my (?:ex|girlfriend|boyfriend|wife|husband|friend|neighbou?r|boss|teacher)'?s?|her|his|their|another person'?s|victim'?s)\b.{0,30}\b(?:account|instagram|facebook|whatsapp|snapchat|gmail|email|phone|password|wifi|wi-fi|camera|webcam|messages|chats?)\b/i,
        /\b(?:spy app|stalkerware|keylogger)\b.{0,40}\b(?:install|hide|secretly)\b.{0,40}\b(?:partner|wife|husband|girlfriend|boyfriend|phone)\b/i],
      msg: 'I can\'t help access someone else\'s accounts or devices without their permission.', alt: 'I can help you secure your own accounts, or recover access through the official process.' },
    { id: 'selfharm', label: 'Self-harm methods', out: false, support: true,
      re: [/\b(?:how (?:to|can i)|best way to|easiest way to|ways to|methods? (?:of|to|for))\b.{0,30}\b(?:kill myself|commit suicide|end my life|hang myself|overdose to die|cut myself)\b/i],
      msg: 'I can\'t help with that, but I care about you. If you are thinking about hurting yourself, please talk to someone you trust or contact local emergency services or a crisis line right now.', alt: 'I\'m happy to listen, or help you plan the next small step.' }
  ]);

  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', '$': 's' };
  function norm(t) {
    let s = String(t || '').normalize('NFKD').replace(/[\u0300-\u036f\u200b-\u200f\u2060\ufeff]/g, '').toLowerCase();
    s = s.replace(/[\s_]+/g, ' ');
    return s;
  }
  const deleet = s => s.replace(/([a-z])([01345@$])(?=[a-z])/g, (m, x, c) => x + (LEET[c] || c));

  const Safety = {
    RULES,
    /* returns null, or the first matching rule */
    check(text, opt) {
      const out = !!(opt && opt.output); if (!text) return null;
      const a = norm(text).slice(0, 60000), b = deleet(a);
      for (const r of RULES) {
        if (out && !r.out) continue;
        if (r.unless && r.unless.test(a)) continue;
        for (const re of r.re) { if (re.test(a) || (b !== a && re.test(b))) return r; }
      }
      return null;
    },
    alert(hit) {
      try {
        const c = document.getElementById('mc'); if (!c) return;
        const e = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        c.innerHTML = '<h3>🛡 Safety alert</h3><p style="margin:8px 0;line-height:1.55">' + e(hit.msg) + '</p><p class="qw"><b>Rule:</b> ' + e(hit.label) + '</p>' +
          (hit.alt ? '<p style="margin:8px 0;line-height:1.55"><b>Safe alternative:</b> ' + e(hit.alt) + '</p>' : '') +
          '<button class="pb" id="sf_ok">OK</button>';
        document.getElementById('mo').hidden = false;
        document.getElementById('sf_ok').onclick = () => { document.getElementById('mo').hidden = true; c.innerHTML = ''; };
        if (window.Usage) Usage.log('safety', hit.id, false, hit.id);
      } catch (x) { /* never let the alert itself break the app */ }
    },
    /* stop the request before it reaches any model */
    guard(text, ctx) {
      const hit = this.check(text); if (!hit) return;
      this.alert(hit);
      const er = new Error('Blocked by CUTE-S AI safety rules (' + hit.label + ').'); er.safety = true; er.rule = hit.id; throw er;
    },
    guardOutput(text) {
      const hit = this.check(text, { output: true }); if (!hit) return;
      this.alert(hit);
      const er = new Error('The answer was removed by CUTE-S AI safety rules (' + hit.label + ').'); er.safety = true; er.rule = hit.id; throw er;
    },
    userText(msgs) { return (msgs || []).filter(m => m && m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '').join('\n'); },

    /* wrap every AI entry point of the existing app */
    install() {
      if (Safety.installed) return; Safety.installed = true;
      const origAi = window.aiCall;
      if (typeof origAi === 'function') {
        window.aiCall = async function (msgs, onTxt) {
          try { Safety.guard(Safety.userText(msgs), 'input'); } catch (e) { return { full: '', err: e.message }; }
          // A model chosen in C-Univers-AI is used EXACTLY as chosen: no fallback, errors name the model.
          if (window.Uni && Uni.pin) {
            try { const full = await Adapters.puter.chat(Uni.pin, msgs, onTxt); return { full, err: '', model: Uni.pin.id }; }
            catch (e) { return { full: '', err: e.message || 'failed', model: Uni.pin.id }; }
          }
          const r = await origAi(msgs, onTxt);
          if (r && r.full) { const h = Safety.check(r.full, { output: true }); if (h) { Safety.alert(h); return { full: '', err: 'The answer was removed by CUTE-S AI safety rules (' + h.label + ').' }; } }
          return r;
        };
      }
      const origImg = window.imGen;
      if (typeof origImg === 'function') window.imGen = async function (q) { Safety.guard(q, 'input'); return origImg.apply(this, arguments); };
    }
  };
  window.Safety = Safety;
  Safety.install();
})();
