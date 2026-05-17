export function buildComponents(template: any, variables: string[]) {
  const components: any[] = [];
  let varIndex = 0;

  // 🏗️ Order matters for sequential variable consumption: Header -> Body -> Buttons
  const orderedComponents = [...(template.components || [])].sort((a, b) => {
    const order = { HEADER: 1, BODY: 2, BUTTONS: 3 };
    return (order[a.type?.toUpperCase()] || 99) - (order[b.type?.toUpperCase()] || 99);
  });

  for (const comp of orderedComponents) {
    const type = comp.type?.toUpperCase();
    const format = comp.format?.toUpperCase();

    // 🟡 HEADER Variable & Media Mapping
    if (type === 'HEADER') {
      const headerParams: any[] = [];

      // Media Handling
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
        const mediaParam: any = { type: format.toLowerCase(), [format.toLowerCase()]: {} };
        if (comp.mediaId) {
          mediaParam[format.toLowerCase()].id = comp.mediaId;
        } else if (comp.mediaUrl || comp.example?.header_handle?.[0]) {
          // Priority: 1. Locally cached mediaUrl, 2. Template example header_handle
          mediaParam[format.toLowerCase()].link = comp.mediaUrl || comp.example.header_handle[0];
        }

        if (mediaParam[format.toLowerCase()].id || mediaParam[format.toLowerCase()].link) {
          headerParams.push(mediaParam);
        }
      }

      // Text Variables Handling
      if (format === 'TEXT' && comp.text) {
        const matches = comp.text.match(/\{\{\d+\}\}/g) || [];
        for (let i = 0; i < matches.length; i++) {
          headerParams.push({
            type: 'text',
            text: String(variables[varIndex++] || ' '),
          });
        }
      }

      if (headerParams.length > 0) {
        components.push({ type: 'header', parameters: headerParams });
      }
    }

    // 🟢 BODY Variable Mapping
    if (type === 'BODY') {
      const matches = comp.text?.match(/\{\{\d+\}\}/g) || [];
      const bodyParams = matches.map(() => ({
        type: 'text',
        text: String(variables[varIndex++] || ' '),
      }));

      components.push({
        type: 'body',
        parameters: bodyParams,
      });
    }

    // 🔵 BUTTONS (URL Variable Support)
    if (type === 'BUTTONS') {
      (comp.buttons || []).forEach((btn, btnIdx) => {
        if (btn.type?.toUpperCase() === 'URL' && btn.url?.includes('{{')) {
          const matches = btn.url.match(/\{\{\d+\}\}/g) || [];
          const btnParams = matches.map(() => ({
            type: 'text',
            text: String(variables[varIndex++] || ' '),
          }));

          if (btnParams.length > 0) {
            components.push({
              type: 'button',
              sub_type: 'url',
              index: Number(btnIdx),
              parameters: btnParams,
            });
          }
        }
      });
    }
  }

  return components;
}
