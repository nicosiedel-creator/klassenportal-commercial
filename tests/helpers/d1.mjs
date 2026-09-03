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

// Zaehlt Unteranfragen so, wie die Plattform sie zaehlt: jede einzeln ausgefuehrte Anweisung eine,
// ein Stapel genau eine - unabhaengig davon, wie viele Anweisungen er traegt. Nur so misst ein
// Test wirklich das, was auf Cloudflare gegen die Grenze von 1000 zaehlt.
export function d1MitZaehler(db){
  const roh=d1(db),stand={abfragen:0},roheAnweisung=new WeakMap();
  const zaehlen=(fn)=>{stand.abfragen++;return fn();};
  const DB={
    prepare(sql){
      const s=roh.prepare(sql);
      const h={
        bind(...p){s.bind(...p);return h;},
        all:()=>zaehlen(()=>s.all()),
        run:()=>zaehlen(()=>s.run()),
        first:()=>zaehlen(()=>s.first()),
        raw:()=>zaehlen(()=>s.raw()),
      };
      roheAnweisung.set(h,s);
      return h;
    },
    async batch(liste){stand.abfragen++;return roh.batch(liste.map(x=>roheAnweisung.get(x)||x));},
  };
  return{DB,stand};
}
