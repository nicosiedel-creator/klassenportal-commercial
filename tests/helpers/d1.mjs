// Ein D1-artiger Aufsatz auf node:sqlite. Damit laesst sich Code, der env.DB benutzt, wirklich
// ausfuehren statt nur gelesen zu werden - gegen ein echtes SQLite mit echtem Schema.
export function d1(db){
  return {
    prepare(sql){
      let params=[];
      const api={
        bind(...p){params=p;return api;},
        async all(){return{results:db.prepare(sql).all(...params),success:true};},
        async run(){db.prepare(sql).run(...params);return{success:true};},
        async first(){return db.prepare(sql).get(...params)??null;},
        async raw(){return db.prepare(sql).all(...params).map(row=>Object.values(row));},
      };
      return api;
    },
    async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
  };
}
