// Opt-in closed-set routing evaluation prompts for the FarmBot check screen.
// Each rule has Japanese and English paraphrases. Parameter fixtures take their
// member from the committed domain supplied by the caller.
export function farmbotCheckPromptSet(allowedValues) {
  const partDomain = allowedValues.part_names;
  const serviceDomain = allowedValues.part_names_in_service_procedures;
  if (!Array.isArray(partDomain) || partDomain.length === 0) {
    throw new Error('part_names is empty');
  }
  if (!Array.isArray(serviceDomain) || serviceDomain.length === 0) {
    throw new Error('part_names_in_service_procedures is empty');
  }
  const namedPart = partDomain[0];
  const servicePart = serviceDomain[0];

  return [
    { id: 'r1-en', lang: 'en', check: 'R1', text: 'Where do packing quantities differ from the part pages?' },
    { id: 'r1-ja', lang: 'ja', check: 'R1', text: '梱包リストと部品ページの数量差を確認したいです。' },
    { id: 'r2-en', lang: 'en', check: 'R2', text: 'Which assembly or packing references do not resolve to parts?' },
    { id: 'r2-ja', lang: 'ja', check: 'R2', text: '組立または梱包の参照で部品に解決できないものはどれですか？' },
    { id: 'r3-en', lang: 'en', check: 'R3', text: 'Show parts that no assembly or other process references.' },
    { id: 'r3-ja', lang: 'ja', check: 'R3', text: 'どの工程からも参照されていない部品を表示してください。' },
    {
      id: 'r3-named-en',
      lang: 'en',
      check: 'R3',
      parameter: { domain: 'part_names', value: namedPart },
      text: `Is ${namedPart} a part that no assembly or other process references?`,
    },
    {
      id: 'r3-named-ja',
      lang: 'ja',
      check: 'R3',
      parameter: { domain: 'part_names', value: namedPart },
      text: `${namedPart} はどの工程からも参照されていない部品ですか？`,
    },
    { id: 'r4-en', lang: 'en', check: 'R4', text: 'Which packed parts are absent from assembly chapters and pre-assemblies?' },
    { id: 'r4-ja', lang: 'ja', check: 'R4', text: '梱包されているのに組立チャプタやプリ組立にない部品はどれですか？' },
    {
      id: 'r4-named-en',
      lang: 'en',
      check: 'R4',
      parameter: { domain: 'part_names', value: namedPart },
      text: `Is ${namedPart} packed but absent from assembly chapters and pre-assemblies?`,
    },
    {
      id: 'r4-named-ja',
      lang: 'ja',
      check: 'R4',
      parameter: { domain: 'part_names', value: namedPart },
      text: `${namedPart} は梱包されていますが、組立チャプタとプリ組立にない部品ですか？`,
    },
    { id: 'r5-en', lang: 'en', check: 'R5', text: 'Find pre-assembly pages without a machine-readable parts table.' },
    { id: 'r5-ja', lang: 'ja', check: 'R5', text: '機械可読の部品表がないプリ組立ページを探してください。' },
    {
      id: 'r6-en',
      lang: 'en',
      check: 'R6',
      text: 'Which removed Change Log names still appear in assembly chapters, packing or service pages?',
    },
    {
      id: 'r6-ja',
      lang: 'ja',
      check: 'R6',
      text: '変更ログで削除された名前のうち、組立チャプタ・梱包・サービスページに残っているものはどれですか？',
    },
    { id: 'r7-en', lang: 'en', check: 'R7', text: 'Show changed parts that reach no assembly, packing, or service page.' },
    { id: 'r7-ja', lang: 'ja', check: 'R7', text: '組立・梱包・サービスのどのページにも到達しない変更部品を表示してください。' },
    {
      id: 'r7-named-en',
      lang: 'en',
      check: 'R7',
      parameter: { domain: 'part_names', value: namedPart },
      text: `Is ${namedPart} a changed part that reaches no assembly, packing, or service page?`,
    },
    {
      id: 'r7-named-ja',
      lang: 'ja',
      check: 'R7',
      parameter: { domain: 'part_names', value: namedPart },
      text: `${namedPart} は組立・梱包・サービスのどのページにも到達しない変更部品ですか？`,
    },
    {
      id: 'r8-en',
      lang: 'en',
      check: 'R8',
      parameter: { domain: 'part_names_in_service_procedures', value: servicePart },
      text: `Is ${servicePart} a service-only part absent from assembly chapters and pre-assemblies?`,
    },
    {
      id: 'r8-ja',
      lang: 'ja',
      check: 'R8',
      parameter: { domain: 'part_names_in_service_procedures', value: servicePart },
      text: `${servicePart} は組立チャプタとプリ組立になく、サービスでのみ使われる部品ですか？`,
    },
    { id: 'r9-en', lang: 'en', check: 'R9', text: 'Which service-page references fail to resolve to a part?' },
    { id: 'r9-ja', lang: 'ja', check: 'R9', text: 'サービスページの参照で部品に解決できないものはどれですか？' },
  ];
}
