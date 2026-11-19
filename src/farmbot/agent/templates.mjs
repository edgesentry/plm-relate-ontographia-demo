// Fixed per-rule text for causes and countermeasures.
//
// A cause is labelled `fact` when it restates a value from the evidence or the
// seed, and `inference` when it is a candidate explanation. The tool shows that
// two documents disagree; it never decides which document is right. Cause
// entries that point at another rule carry that rule id in `rule`.
//
// Countermeasures are fixed sentences per rule. They are not derived from
// third-party text: every value interpolated here is a seeded name, path or
// integer.
//
// Every function takes an optional language. It defaults to English, which is
// what the collector stores in the findings document. The screen asks for
// `'ja'` when it renders the body in Japanese; nothing here writes Japanese
// into the document.

/**
 * @typedef {{ kind: 'fact' | 'inference', rule: string | null, text: string }} Cause
 */

/**
 * @param {'fact' | 'inference'} kind
 * @param {string} text
 * @param {string | null} [rule]
 * @returns {Cause}
 */
function cause(kind, text, rule = null) {
  return { kind, rule, text };
}

/**
 * Describe the non-machine-readable pre-assembly pages as a cause candidate.
 *
 * @param {readonly string[]} paths Sorted page paths.
 * @param {'ja' | 'en'} [lang] Defaults to English for the stored document.
 * @returns {Cause}
 */
export function r5CauseCandidate(paths, lang = 'en') {
  if (paths.length === 0) {
    return cause(
      'inference',
      lang === 'ja'
        ? 'R5: 現在のシードでは、機械可読な部品表がないプリ組立ページはありません。'
        : 'R5: no pre-assembly page lacks a machine-readable parts table on the current seed.',
      'R5',
    );
  }
  return cause(
    'inference',
    lang === 'ja'
      ? `R5: 機械可読な部品表がないプリ組立ページが ${paths.length} 件あります` +
        `（${paths.join('、')}）。そのため、これらのページの部品リストは参照として現れません。`
      : `R5: ${paths.length} pre-assembly page(s) have no machine-readable parts table ` +
        `(${paths.join(', ')}), so their component lists cannot appear as references.`,
    'R5',
  );
}

/**
 * @param {{ file: string, partName: string, variantCode: string, packingQuantity: number, partQuantity: number, quantityDifference: number }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function quantityCauses(facts, lang = 'en') {
  const direction = facts.quantityDifference > 0 ? 'higher' : 'lower';
  if (lang === 'ja') {
    const japaneseDirection = facts.quantityDifference > 0 ? '多い' : '少ない';
    return [
      cause(
        'fact',
        `${facts.file} の梱包リストでは ${facts.partName}（${facts.variantCode}）が ` +
          `${facts.packingQuantity}、部品ページでは ${facts.partQuantity} です。`,
      ),
      cause(
        'fact',
        `梱包数量は ${Math.abs(facts.quantityDifference)} だけ${japaneseDirection}です。`,
      ),
      cause(
        'inference',
        '2 つの文書は一致していません。どちらも古い可能性があり、このツールはどちらの数量が意図されたものか判断しません。',
      ),
    ];
  }
  return [
    cause(
      'fact',
      `The packing list on ${facts.file} gives ${facts.packingQuantity} for ` +
        `${facts.partName} (${facts.variantCode}); the part page gives ${facts.partQuantity}.`,
    ),
    cause(
      'fact',
      `The packing quantity is ${direction} by ${Math.abs(facts.quantityDifference)}.`,
    ),
    cause(
      'inference',
      'The two documents disagree; either may be stale, and this tool does not decide which count is intended.',
    ),
  ];
}

/**
 * @param {{ partName: string, variantCode: string }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function quantityCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `${facts.partName}（${facts.variantCode}）の意図する数量を製造部門に確認してください。`,
      '梱包リストと部品ページのうち古くなっている方を修正し、抽出を再構築してください。',
    ];
  }
  return [
    `Confirm the intended count for ${facts.partName} (${facts.variantCode}) with manufacturing.`,
    'Correct whichever of the packing list and the part page is out of date, then rebuild the extract.',
  ];
}

/**
 * @param {{ displayName: string, lineCount: number, structureCount: number }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function unresolvedReferenceCauses(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      cause(
        'fact',
        `名前 "${facts.displayName}" は ${facts.lineCount} 件の参照行、` +
          `${facts.structureCount} ページに現れ、そのいずれも部品に解決しません。`,
      ),
      cause(
        'inference',
        '名前の綴りが誤っているか、別の名前で登録された部品の同義語であるか、部品ページを持たない項目を指している可能性があります。',
      ),
    ];
  }
  return [
    cause(
      'fact',
      `The name "${facts.displayName}" appears on ${facts.lineCount} reference line(s) ` +
        `across ${facts.structureCount} page(s), and none of them resolves to a part.`,
    ),
    cause(
      'inference',
      'The name may be misspelled, may use a synonym for a part listed under another name, or may refer to an item that has no part page.',
    ),
  ];
}

/**
 * @param {{ displayName: string }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function unresolvedReferenceCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `"${facts.displayName}" の部品ページを追加するか、示された行の綴りを修正してください。`,
      '同義語である場合は対応関係を記録し、次回の抽出で同じ参照が解決されるようにしてください。',
    ];
  }
  return [
    `Add a part page for "${facts.displayName}" or correct the spelling at the listed lines.`,
    'If the name is a synonym, record the mapping so the same reference resolves on the next extract.',
  ];
}

/**
 * @param {{ partName: string, categorySlug: string, r5Paths: readonly string[], r5Cause?: Cause }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function unreferencedPartCauses(facts, lang = 'en') {
  const r5 = facts.r5Cause ?? r5CauseCandidate(facts.r5Paths, lang);
  if (lang === 'ja') {
    return [
      cause(
        'fact',
        `抽出内で、組立チャプタ、プリ組立、バッグ、梱包のいずれの使用箇所も ${facts.partName} を参照していません。`,
      ),
      cause('fact', `この部品は BOM カテゴリ ${facts.categorySlug} に分類されています。`),
      cause(
        'inference',
        'この部品は未使用か、置き換え済みか、機械可読でない部品表のページでのみ記載されている可能性があります。',
      ),
      r5,
    ];
  }
  return [
    cause(
      'fact',
      `No assembly chapter, pre-assembly, bag or packing usage references ${facts.partName} in the extract.`,
    ),
    cause('fact', `The part is filed under the BOM category ${facts.categorySlug}.`),
    cause(
      'inference',
      'The part may be unused, superseded, or documented only on a page whose component list is not machine-readable.',
    ),
    r5,
  ];
}

/**
 * @param {{ partName: string }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function unreferencedPartCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `${facts.partName} が現在も BOM にあるか確認し、そうでなければ削除するか分類し直してください。`,
      'この部品がプリ組立に属する場合は、そのページに機械可読な部品表を追加してください。',
    ];
  }
  return [
    `Confirm whether ${facts.partName} is still in the BOM and remove or re-file it if it is not.`,
    'If the part belongs to a pre-assembly, add a machine-readable parts table to that page.',
  ];
}

/**
 * @param {{ partName: string, files: readonly string[], r5Paths: readonly string[], r5Cause?: Cause }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function packedWithoutProcessCauses(facts, lang = 'en') {
  const r5 = facts.r5Cause ?? r5CauseCandidate(facts.r5Paths, lang);
  if (lang === 'ja') {
    return [
      cause(
        'fact',
        `${facts.partName} は ${facts.files.join('、')} で梱包されていますが、` +
          '組立チャプタ、プリ組立、バッグのいずれの使用箇所も参照していません。',
      ),
      cause(
        'inference',
        'この部品は意図的な同梱スペアであるか、これを使う組立手順が抽出から欠けている可能性があります。',
      ),
      r5,
    ];
  }
  return [
    cause(
      'fact',
      `${facts.partName} is packed on ${facts.files.join(', ')} but no assembly chapter, ` +
        'pre-assembly or bag usage references it.',
    ),
    cause(
      'inference',
      'The part may be a deliberate shipping spare, or an assembly step that uses it may be missing from the extract.',
    ),
    r5,
  ];
}

/**
 * @param {{ partName: string }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function packedWithoutProcessCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `${facts.partName} が梱包リスト上の意図的なスペアかどうか確認してください。`,
      'そうでない場合は、梱包された部品に工程手順があるよう、欠けている組立チャプタまたはプリ組立の参照を追加してください。',
    ];
  }
  return [
    `Confirm whether ${facts.partName} is a deliberate spare in the packing list.`,
    'Otherwise add the missing assembly chapter or pre-assembly reference so the packed part has a process step.',
  ];
}

/**
 * @param {{ path: string, reason: string, pdfCount: number }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function unreadablePageCauses(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      cause(
        'fact',
        `プリ組立ページ ${facts.path} には機械可読な部品表がありません` +
          `（${facts.reason}、PDF ファイル ${facts.pdfCount} 件）。`,
      ),
      cause(
        'inference',
        'このページの部品は部品ページにリンクできないため、プリ組立の参照に依存するチェックでは検出できません。',
      ),
    ];
  }
  return [
    cause(
      'fact',
      `The pre-assembly page ${facts.path} has no machine-readable parts table ` +
        `(${facts.reason}; ${facts.pdfCount} PDF file(s)).`,
    ),
    cause(
      'inference',
      'Components of this page cannot be linked to part pages, so checks that rely on pre-assembly references cannot see them.',
    ),
  ];
}

/**
 * @param {{ path: string }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function unreadablePageCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `${facts.path} に Markdown の部品表を追加するか、PDF 抽出から部品リストを記録してください。`,
    ];
  }
  return [
    `Add a Markdown parts table to ${facts.path}, or record the component list from the PDF extract.`,
  ];
}

/**
 * @param {{ name: string, inferred: boolean, sections: readonly string[], files: readonly string[] }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function changedNameCauses(facts, lang = 'en') {
  const where = facts.files.join(', ');
  const sections = facts.sections.join(', ');
  const stillList = facts.files.length === 1 ? 'still lists it' : 'still list it';
  if (lang === 'ja') {
    return [
      cause(
        'fact',
        facts.inferred
          ? `変更ログの ${facts.sections.join('、')} にある削除の記述は "${facts.name}" を挙げていますが、` +
            `${facts.files.join('、')} には依然として記載されています。`
          : `変更ログは ${facts.sections.join('、')} で ${facts.name} を部品ページにリンクしていますが、` +
            `${facts.files.join('、')} は依然としてその部品を参照しています。`,
      ),
      cause(
        'inference',
        '下流のページが古いか、変更ログが以前の版を記述している可能性があります。このツールはどちらの文書が現行か判断しません。',
      ),
    ];
  }
  return [
    cause(
      'fact',
      facts.inferred
        ? `The Change Log removal statement in ${sections} names "${facts.name}", and ${where} ${stillList}.`
        : `The Change Log links ${facts.name} to its part page in ${sections}, and ${where} still reference that part.`,
    ),
    cause(
      'inference',
      'The downstream page may be stale, or the Change Log may describe an earlier revision; this tool does not decide which document is current.',
    ),
  ];
}

/**
 * @param {{ name: string, files: readonly string[] }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function changedNameCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `${facts.name} が ${facts.files.join('、')} に依然として表示されるべきか確認してください。`,
      '変更ログまたは下流のページを修正し、抽出を再構築してください。',
    ];
  }
  return [
    `Confirm whether ${facts.name} should still appear on ${facts.files.join(', ')}.`,
    'Correct the Change Log or the downstream page, then rebuild the extract.',
  ];
}

/**
 * @param {{ partName: string, unresolvedNames: readonly string[], r5Paths: readonly string[], unresolvedCause?: Cause, r5Cause?: Cause }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function changedPartUnreachedCauses(facts, lang = 'en') {
  const r5 = facts.r5Cause ?? r5CauseCandidate(facts.r5Paths, lang);
  if (lang === 'ja') {
    const causes = [
      cause(
        'fact',
        `変更ログは ${facts.partName} を変更していますが、抽出内の組立チャプタ、プリ組立、梱包リスト、サービスページのいずれもそれを参照していません。`,
      ),
      cause(
        'inference',
        'この部品は新しくまだ文書化されていないか、未使用か、部品ページに解決しなかった参照によってのみ名前が挙がっている可能性があります。',
      ),
    ];
    if (facts.unresolvedCause) {
      causes.push(facts.unresolvedCause);
    } else if (facts.unresolvedNames.length > 0) {
      causes.push(
        cause(
          'inference',
          `未解決の名前（${facts.unresolvedNames.join('、')}）は、別の表記でこの部品を指している可能性があります。`,
          'R2',
        ),
      );
    }
    causes.push(r5);
    return causes;
  }
  const causes = [
    cause(
      'fact',
      `The Change Log changes ${facts.partName}, but no assembly chapter, pre-assembly, packing list or service page references it in the extract.`,
    ),
    cause(
      'inference',
      'The part may be new and not yet documented, unused, or named only by a reference that did not resolve to a part page.',
    ),
  ];
  if (facts.unresolvedCause) {
    causes.push(facts.unresolvedCause);
  } else if (facts.unresolvedNames.length > 0) {
    causes.push(
      cause(
        'inference',
        `The unresolved name(s) ${facts.unresolvedNames.join(', ')} may be this part under another spelling.`,
        'R2',
      ),
    );
  }
  causes.push(r5);
  return causes;
}

/**
 * @param {{ partName: string }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function changedPartUnreachedCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `${facts.partName} の欠けている参照を追加するか、このビルドで使用されていないことを確認してください。`,
      '参照がプリ組立ページにある場合は、抽出が認識できるよう機械可読な部品表を追加してください。',
    ];
  }
  return [
    `Add the missing reference for ${facts.partName}, or confirm that the part is not used in this build.`,
    'If the reference exists on a pre-assembly page, add a machine-readable parts table so the extract can see it.',
  ];
}

/**
 * @param {{ partName: string, servicePages: readonly string[], packedFiles: readonly string[], unreferenced: boolean, r5Paths: readonly string[], r5Cause?: Cause }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function serviceOnlyPartCauses(facts, lang = 'en') {
  const r5 = facts.r5Cause ?? r5CauseCandidate(facts.r5Paths, lang);
  if (lang === 'ja') {
    const causes = [
      cause(
        'fact',
        `${facts.partName} は ${facts.servicePages.join('、')} で名前が挙がっていますが、組立チャプタもプリ組立も参照していません。`,
      ),
    ];
    if (facts.packedFiles.length > 0) {
      causes.push(
        cause(
          'fact',
          `${facts.partName} は ${facts.packedFiles.join('、')} で梱包されています。`,
          'R4',
        ),
      );
    }
    if (facts.unreferenced) {
      causes.push(
        cause('fact', `${facts.partName} は抽出内の他のどこからも参照されていません。`, 'R3'),
      );
    }
    causes.push(
      cause(
        'inference',
        'この部品はサービス専用のスペアであるか、それを取り付ける組立手順が抽出から欠けている可能性があります。',
      ),
    );
    causes.push(r5);
    return causes;
  }
  const causes = [
    cause(
      'fact',
      `${facts.partName} is named on ${facts.servicePages.join(', ')}, but no assembly chapter or pre-assembly references it.`,
    ),
  ];
  if (facts.packedFiles.length > 0) {
    causes.push(
      cause(
        'fact',
        `${facts.partName} is packed on ${facts.packedFiles.join(', ')}.`,
        'R4',
      ),
    );
  }
  if (facts.unreferenced) {
    causes.push(
      cause('fact', `${facts.partName} is referenced by nothing else in the extract.`, 'R3'),
    );
  }
  causes.push(
    cause(
      'inference',
      'The part may be a service-only spare, or an assembly step that installs it may be missing from the extract.',
    ),
  );
  causes.push(r5);
  return causes;
}

/**
 * @param {{ partName: string }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function serviceOnlyPartCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `${facts.partName} が組立中に取り付けられ、組立チャプタまたはプリ組立に属するか確認してください。`,
      'サービス専用のスペアである場合は、その違いが意図的であるよう梱包またはサービスページに記録してください。',
    ];
  }
  return [
    `Confirm whether ${facts.partName} is installed during assembly and belongs on an assembly chapter or pre-assembly.`,
    'If it is a service-only spare, record that in the packing or service page so the difference is intentional.',
  ];
}

/**
 * @param {{ displayName: string, pages: readonly string[], candidates: readonly string[], r2Names: readonly string[], r2Cause?: Cause }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {Cause[]}
 */
export function unresolvedServiceCauses(facts, lang = 'en') {
  const where = facts.pages.join(', ');
  if (lang === 'ja') {
    const causes = [
      cause(
        'fact',
        `未解決の名前 "${facts.displayName}" は ${facts.pages.join('、')} に現れ、どの部品ページにも解決しません。`,
      ),
    ];
    if (facts.candidates.length > 0) {
      causes.push(
        cause(
          'fact',
          `抽出には次の候補部品が記録されています: ${facts.candidates.join('、')}。`,
        ),
      );
    } else {
      causes.push(
        cause('inference', 'この名前について、抽出には候補部品が記録されていません。'),
      );
    }
    if (facts.r2Cause) {
      causes.push(facts.r2Cause);
    } else if (facts.r2Names.length > 0) {
      causes.push(
        cause(
          'inference',
          `同じ名前は ${facts.r2Names.join('、')} でも未解決です。`,
          'R2',
        ),
      );
    }
    causes.push(
      cause(
        'inference',
        '名前の綴りが誤っているか、別の名前で登録された部品の同義語であるか、部品ページを持たない項目を指している可能性があります。',
      ),
    );
    return causes;
  }
  const causes = [
    cause(
      'fact',
      `The unresolved name "${facts.displayName}" appears on ${where}, and it resolves to no part page.`,
    ),
  ];
  if (facts.candidates.length > 0) {
    causes.push(
      cause(
        'fact',
        `The extract recorded these candidate parts: ${facts.candidates.join(', ')}.`,
      ),
    );
  } else {
    causes.push(
      cause('inference', 'The extract recorded no candidate part for this name.'),
    );
  }
  if (facts.r2Cause) {
    causes.push(facts.r2Cause);
  } else if (facts.r2Names.length > 0) {
    causes.push(
      cause(
        'inference',
        `The same name is also unresolved on ${facts.r2Names.join(', ')}.`,
        'R2',
      ),
    );
  }
  causes.push(
    cause(
      'inference',
      'The name may be misspelled, may use a synonym for a part listed under another name, or may refer to an item that has no part page.',
    ),
  );
  return causes;
}

/**
 * @param {{ displayName: string, pages: readonly string[] }} facts
 * @param {'ja' | 'en'} [lang]
 * @returns {string[]}
 */
export function unresolvedServiceCountermeasures(facts, lang = 'en') {
  if (lang === 'ja') {
    return [
      `"${facts.displayName}" の部品ページを追加するか、${facts.pages.join('、')} で修正してください。`,
      '同義語である場合は対応関係を記録し、次回の抽出でサービス参照が解決されるようにしてください。',
    ];
  }
  return [
    `Add a part page for "${facts.displayName}" or correct it on ${facts.pages.join(', ')}.`,
    'If the name is a synonym, record the mapping so the service reference resolves on the next extract.',
  ];
}
