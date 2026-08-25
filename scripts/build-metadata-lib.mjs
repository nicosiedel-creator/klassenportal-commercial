export function stampHomepageBuildCommit(html,commit){
  const source=String(html??'');
  const sha=String(commit??'').trim();
  if(!/^[0-9a-f]{40}$/i.test(sha))throw new Error('BUILD_COMMIT_SHA_INVALID');
  const marker=`<meta name="kp-build-commit" content="${sha}">`;
  const existing=/<meta name="kp-build-commit" content="[^"]*">/g;
  const matches=source.match(existing)||[];
  if(matches.length>1)throw new Error('BUILD_COMMIT_MARKER_DUPLICATE');
  if(matches.length===1)return source.replace(existing,marker);
  if(!source.includes('</head>'))throw new Error('BUILD_COMMIT_MARKER_HEAD_MISSING');
  return source.replace('</head>',`${marker}</head>`);
}
