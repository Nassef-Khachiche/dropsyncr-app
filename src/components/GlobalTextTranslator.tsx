import { useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translateUiText } from '../contexts/uiTranslations';

const textAttributes = ['placeholder', 'title', 'aria-label'];

const shouldSkipNode = (node: Node) => {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT';
};

export function GlobalTextTranslator() {
  const { language } = useLanguage();

  useEffect(() => {
    let isApplying = false;

    const applyTranslations = () => {
      if (isApplying) return;
      isApplying = true;

      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];

        let currentNode = walker.nextNode();
        while (currentNode) {
          if (!shouldSkipNode(currentNode)) {
            textNodes.push(currentNode as Text);
          }
          currentNode = walker.nextNode();
        }

        for (const textNode of textNodes) {
          const original = textNode.textContent || '';
          const translated = translateUiText(original, language);
          if (translated !== original) {
            textNode.textContent = translated;
          }
        }

        const elements = document.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]');
        elements.forEach((element) => {
          textAttributes.forEach((attribute) => {
            const value = element.getAttribute(attribute);
            if (!value) return;
            const translated = translateUiText(value, language);
            if (translated !== value) {
              element.setAttribute(attribute, translated);
            }
          });
        });
      } finally {
        isApplying = false;
      }
    };

    const run = () => requestAnimationFrame(applyTranslations);
    run();

    const observer = new MutationObserver(() => {
      run();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: textAttributes,
    });

    return () => {
      observer.disconnect();
    };
  }, [language]);

  return null;
}
