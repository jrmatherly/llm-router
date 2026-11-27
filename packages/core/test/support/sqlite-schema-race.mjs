import Database from "better-sqlite3";

// Stands in for a second process: right after a store reads a table's columns, another
// connection adds one of them and commits, which is the moment two opens collide.
export function addColumnRightAfterTheColumnsAreRead(file, table, columnSql) {
  const prepare = Database.prototype.prepare;
  let armed = true;
  Database.prototype.prepare = function (sql, ...rest) {
    const statement = prepare.call(this, sql, ...rest);
    if (!armed || sql.trim() !== `PRAGMA table_info(${table})`) return statement;
    armed = false;
    const all = statement.all.bind(statement);
    statement.all = (...params) => {
      const rows = all(...params);
      const other = new Database(file, { timeout: 100 });
      try {
        other.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
      } catch (error) {
        if (!/locked|busy/i.test(error.message)) throw error;
      } finally {
        other.close();
      }
      return rows;
    };
    return statement;
  };
  return () => { Database.prototype.prepare = prepare; };
}

// UsageStore.open reads a table's columns twice, once to choose its path and once inside the schema
// function, and two opens collide at the second. This fires at the read the caller names.
export function addColumnAtTheNthReadOfTheColumns(file, table, columnSql, nth) {
  const prepare = Database.prototype.prepare;
  let reads = 0;
  Database.prototype.prepare = function (sql, ...rest) {
    const statement = prepare.call(this, sql, ...rest);
    if (sql.trim() !== `PRAGMA table_info(${table})`) return statement;
    reads += 1;
    if (reads !== nth) return statement;
    const all = statement.all.bind(statement);
    statement.all = (...params) => {
      const rows = all(...params);
      const other = new Database(file, { timeout: 100 });
      try {
        other.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
      } catch (error) {
        if (!/locked|busy/i.test(error.message)) throw error;
      } finally {
        other.close();
      }
      return rows;
    };
    return statement;
  };
  return { reads: () => reads, restore: () => { Database.prototype.prepare = prepare; } };
}
