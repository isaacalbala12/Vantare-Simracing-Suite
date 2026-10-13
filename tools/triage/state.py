"""SQLite metadata only. Redacted delivery spool is 0600 and deleted after ACK/24h."""
import json
import os
from pathlib import Path
import sqlite3
import uuid


class State:
    def __init__(self, root):
        self.root=Path(root)
        if self.root.is_symlink():
            raise ValueError('unsafe_state_directory')
        self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        os.chmod(self.root,0o700)
        self.db=sqlite3.connect(self.root/'state.db')
        os.chmod(self.root/'state.db',0o600)
        self.db.executescript('''create table if not exists reports(
          id text primary key,status text not null,attempt integer not null default 0,
          seen_at integer not null,delivery_until integer,delivered_at integer);
          create table if not exists cursor(singleton integer primary key check(singleton=1),created_at text,id text);''')
        self.db.commit()

    def close(self):
        self.db.close()

    def cursor(self):
        return self.db.execute('select created_at,id from cursor where singleton=1').fetchone()

    def discover(self, report, now):
        if str(uuid.UUID(report['id'])) != report['id']:
            raise ValueError('invalid_state_id')
        self.db.execute("insert into reports(id,status,seen_at) values (?,'new',?) on conflict(id) do nothing",(report['id'],now))
        old=self.cursor()
        current=(report['created_at'],report['id'])
        from analysis import utc
        if old is None or (utc(current[0]),current[1]) > (utc(old[0]),old[1]):
            self.db.execute('insert into cursor values (1,?,?) on conflict(singleton) do update set created_at=excluded.created_at,id=excluded.id',current)
        self.db.commit()

    def pending_ids(self):
        return [x[0] for x in self.db.execute("select id from reports where status in ('new','analysis_failed') and attempt<3 order by seen_at limit 20")]

    def attempt(self, id):
        row=self.db.execute('select status,attempt from reports where id=?',(id,)).fetchone()
        if row is None or row[0] not in ('new','analysis_failed') or row[1]>=3:
            return None
        self.db.execute('update reports set attempt=attempt+1 where id=?',(id,));self.db.commit()
        return row[1]+1

    def analyzed(self, id, payload, now, failed=False):
        path=self.root/(id+'.json')
        temp=self.root/(id+'.'+uuid.uuid4().hex+'.tmp')
        with temp.open('x',encoding='utf-8') as file:
            os.chmod(temp,0o600);json.dump(payload,file,ensure_ascii=False);file.flush();os.fsync(file.fileno())
        os.replace(temp,path)
        self.db.execute('update reports set status=?,delivery_until=? where id=?',('failed' if failed else 'analyzed',now+86400,id));self.db.commit()

    def analysis_failed(self,id):
        self.db.execute("update reports set status='analysis_failed' where id=?",(id,));self.db.commit()

    def deliveries(self,now):
        return [x[0] for x in self.db.execute("select id from reports where status in ('analyzed','failed') and delivery_until>=? order by seen_at limit 20",(now,))]

    def payload(self,id):
        return json.loads((self.root/(id+'.json')).read_text(encoding='utf-8'))

    def delivered(self,id,now):
        self.db.execute("update reports set status='delivered',delivered_at=? where id=?",(now,id));self.db.commit()
        (self.root/(id+'.json')).unlink(missing_ok=True)

    def purge(self,now):
        expired=[x[0] for x in self.db.execute('select id from reports where delivery_until<? or seen_at<?',(now,now-90*86400))]
        for id in expired:
            (self.root/(id+'.json')).unlink(missing_ok=True)
        self.db.execute("update reports set status='delivery_expired' where status in ('analyzed','failed') and delivery_until<?",(now,))
        self.db.execute('delete from reports where seen_at<?',(now-90*86400,));self.db.commit()
