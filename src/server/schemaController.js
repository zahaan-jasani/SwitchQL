const tab = `  `;

function parseGraphqlServer(data, database) {
  let query = "const graphql = require('graphql');\n";

  if (database === 'MongoDB') {
    for (const prop in data) {
      query += buildDbModelRequirePaths(data[prop]);
    }
  }

  if (database === 'MySQL') {
    query += `const getConnection = require('../db/mysql_pool.js');\n`;
  }

  if (database === 'PostgreSQL') {
    query += `const connect = require('../db/postgresql_pool.js');\n`;
  }

  query += `const { 
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLID,
  GraphQLString, 
  GraphQLInt, 
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull
} = graphql;
  \n`;

  // BUILD TYPE SCHEMA
  for (const prop in data) {
    query += buildGraphqlTypeSchema(data[prop], data, database);
  }

  // BUILD ROOT QUERY
  query += `const RootQuery = new GraphQLObjectType({\n${tab}name: 'RootQueryType',\n${tab}fields: {\n`;

  let firstRootLoop = true;
  for (const prop in data) {
    if (!firstRootLoop) query += ',\n';
    firstRootLoop = false;

    query += buildGraphqlRootQuery(data[prop], database);
  }
  query += `\n${tab}}\n});\n\n`;

  // BUILD MUTATIONS
  query += `const Mutation = new GraphQLObjectType({\n${tab}name: 'Mutation',\n${tab}fields: {\n`;

  let firstMutationLoop = true;
  for (const prop in data) {
    if (!firstMutationLoop) query += ',\n';
    firstMutationLoop = false;

    query += buildGraphqlMutationQuery(data[prop], database);
  }
  query += `\n${tab}}\n});\n\n`;

  query += `module.exports = new GraphQLSchema({\n${tab}query: RootQuery,\n${tab}mutation: Mutation\n});`;
  return query;
}

// complete = false
function buildDbModelRequirePaths(data) {
  return `const ${data.type} = require('../db/${data.type.toLowerCase()}.js');\n`;
}

// complete = false
function buildGraphqlTypeSchema(table, data, database) {
  let subQuery ='';
  let query = `const ${table.type}Type = new GraphQLObjectType({\n${tab}name: '${table.type}',\n${tab}fields: () => ({`;

  let firstLoop = true;
  for (let currField in table.fields) {
    if (!firstLoop) query+= ',';
    firstLoop = false;

    query += `\n${tab}${tab}${table.fields[currField].name}: { type: ${tableTypeToGraphqlType(table.fields[currField].type)} }`;

    // later try to maintain the foreign key field to be the primary value?? NO
    if (table.fields[currField].inRelationship === true) {
      subQuery += createSubQuery(table.fields[currField], data, database) + ', ';
    }

    // dont need anymore because defined relationships for both related tables in field.relation
    // const refBy = table.fields[currField].refBy;
    // if (Array.isArray(refBy)) {
    //   refBy.forEach(value => {
    //     const parsedValue = value.split('.');
    //     const field = {
    //       name: table.fields[currField].name,
    //       relation: {
    //         tableIndex: parsedValue[0],
    //         fieldIndex: parsedValue[1],
    //         refType: parsedValue[2],
    //         type: table.fields[currField].type
    //       }
    //     };
    //     query += createSubQuery(field, data, database);
    //   });
    // }
  }
  query += subQuery.slice(0, -2);
  return query += `\n${tab}})\n});\n\n`;
}

// complete = TRUE
function tableTypeToGraphqlType(type) {
  switch (type) {
    case 'ID':
      return 'GraphQLID';
    case 'String':
      return 'GraphQLString';
    case 'Number':
      return 'GraphQLInt';
    case 'Boolean':
      return 'GraphQLBoolean';
    case 'Float':
      return 'GraphQLFloat';
    // tentative 'Date' type, will need to make custom scalar later
    case 'Date':
      return 'Date'
    default:
      return 'GraphQLString';
  }
}

// complete = TRUE
function toTitleCase(refTypeName) {
  let name = refTypeName[0].toUpperCase();
  name += refTypeName.slice(1).toLowerCase();
  return name;
}

// complete = TRUE
function createSubQuery(field, data, database) {
  const refTable = data[field.relation.refTable].type;
  const refFieldName = data[field.relation.refTable].fields[field.relation.refField].name;
  const refFieldType = data[field.relation.refTable].fields[field.relation.refField].type;
  let query = `,\n${tab}${tab}${createSubQueryName(refTable)}: {\n${tab}${tab}${tab}type: `;

  if (field.relation.refType === 'one to many' || field.relation.refType === 'many to many') {
    query += `new GraphQLList(${refTable}Type),`;
  } else {
    query += `${refTable}Type,`;
  }
  query += `\n${tab}${tab}${tab}resolve(parent, args) {\n${tab}${tab}${tab}${tab}`;

  if (database === 'MongoDB') {
    query += `return ${refTable}.${findDbSearchMethod(refFieldName, refFieldType, field.relation.refType)}`;
    query += `(${createSearchObject(refFieldName, refFieldType, field)});\n`;
    query += `${tab}${tab}${tab}}\n`;
    query += `${tab}${tab}}`;
  }

  if (database === 'MySQL' || database === 'PostgreSQL') {
    if (database === 'MySQL') query += `getConnection`
    if (database === 'PostgreSQL') query += `connect`
    query += `((err, con) => {\n${tab}${tab}${tab}${tab}${tab}const sql = \`SELECT * FROM ${refTable} WHERE `;


    // Change condition to check against field.primaryKey bc both relation are ID
    if (field.primaryKey) {
      query += `${field.name} = \${parent.${field.name}}`;
    } else {
      query += `${refFieldName} = \${parent.${field.name}}`;
    }
    query += `\`;\n${tab}${tab}${tab}${tab}${tab}con.query(sql, (err, result) => {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}if (err) throw err;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}con.release();\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}return result;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}})\n`;
    query += `${tab}${tab}${tab}${tab}})\n`;
    query += `${tab}${tab}${tab}}\n`;
    query += `${tab}${tab}}`;
  }

  return query;

  // complete = TRUE
  function createSubQueryName() {
    switch (field.relation.refType) {
      case 'one to one':
        return `related${toTitleCase(refTable)}`;
      case 'one to many':
        return `everyRelated${toTitleCase(refTable)}`;
      case 'many to one':
        return `related${toTitleCase(refTable)}`;
      case 'many to many':
        return `everyRelated${toTitleCase(refTable)}`;
      default:
        return `everyRelated${toTitleCase(refTable)}`;
    }
  }
}

// complete = false bc FOR NoSQL DB's!!
function findDbSearchMethod(refFieldName, refFieldType, refType) {
  if (refFieldName === 'id' || refFieldType === 'ID') return 'findById';
  switch (refType) {
    case 'one to one':
      return 'findOne';
    case 'one to many':
      return 'find';
    case 'many to one':
      return 'find';
    case 'many to many':
      return 'find';
    default:
      return 'find';
  }
}

// complete = false bc FOR NoSQL DB's!!
function createSearchObject(refFieldName, refFieldType, field) {
  if (refFieldName === 'id' || refFieldType === 'ID') {
    return `parent.${field.name}`;
  } else {
    return `{ ${refFieldName}: parent.${field.name} }`;
  }
}

// complete = TRUE
function buildGraphqlRootQuery(table, database) {
  let query = '';

  query += createFindAllRootQuery(table, database);
  
  // if a field exists
  // coerces object to boolean (ie t.f[0] eval to null/undefined/0 -> true -> false)
  // if (!!table.fields[0]) {
  //   query += createFindByIdQuery(table, database);
  // }
  
  // primarykey id is not always the first field in our data
  for(let field in table.fields){
    if(table.fields[field].primaryKey){
      query += createFindByIdQuery(table, table.fields[field], database)
    }
  }

  return query;
}

// complete = TRUE
function createFindAllRootQuery(table, database) {
  let query = `${tab}${tab}every${toTitleCase(table.type)}: {\n${tab}${tab}${tab}type: new GraphQLList(${table.type}Type),\n${tab}${tab}${tab}resolve() {\n${tab}${tab}${tab}${tab}`;

  if (database === 'MongoDB') {
    query += `return ${table.type}.find({});`;
  }

  if (database === 'MySQL' || database === 'PostgreSQL') {
    if (database === 'MySQL') query += `getConnection`
    if (database === 'PostgreSQL') query += `connect`
    query += `((err, con) => {\n${tab}${tab}${tab}${tab}${tab}const sql = \'SELECT * FROM ${table.type}\';\n${tab}${tab}${tab}${tab}${tab}con.query(sql, (err, results) => {\n${tab}${tab}${tab}${tab}${tab}${tab}if (err) throw err;\n${tab}${tab}${tab}${tab}${tab}${tab}con.release();\n${tab}${tab}${tab}${tab}${tab}${tab}return results;\n${tab}${tab}${tab}${tab}${tab}})\n${tab}${tab}${tab}${tab}})`;
  }

  return query += `\n${tab}${tab}${tab}}\n${tab}${tab}}`;
}

// complete = TRUE
function createFindByIdQuery(table, idField, database) {
  let query = `,\n${tab}${tab}${table.type.toLowerCase()}: {\n${tab}${tab}${tab}type: ${table.type}Type,\n${tab}${tab}${tab}args: { ${idField.name}: { type: ${tableTypeToGraphqlType(idField.type) }},\n${tab}${tab}${tab}resolve(parent, args) {\n${tab}${tab}${tab}${tab}`;

  // args.id needs to be changed; are we even using mongo??
  if (database === 'MongoDB') {
    query += `return ${table.type}.findById(args.id);`;
  }

  if (database === 'MySQL' || database === 'PostgreSQL') {
    if (database === 'MySQL') query += `getConnection`
    if (database === 'PostgreSQL') query += `connect`
    query += `((err, con) => {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}const sql = \`SELECT * FROM ${table.type} WHERE ${idField.name} = \${args.${idField.name}}\`;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}con.query(sql, (err, result) => {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}if (err) throw err;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}con.release();\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}return result;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}})\n`;
    query += `${tab}${tab}${tab}${tab}})`;
  }

  return query += `\n${tab}${tab}${tab}}\n${tab}${tab}}`;
}

// complete = TRUE
function buildGraphqlMutationQuery(table, database) {
  let string = ``;
  string += `${addMutation(table, database)}`;
  if (table.fields[0]) {
    string += `,\n${updateMutation(table, database)},\n`;
    string += `${deleteMutation(table, database)}`;
  }
  return string;
}

// complete = TRUE
function addMutation(table, database) {
  let query = `${tab}${tab}add${table.type}: {\n${tab}${tab}${tab}type: ${table.type}Type,\n${tab}${tab}${tab}args: {\n`;

  let fieldNames = '';
  let argNames = '';

  let firstLoop = true;
  for (const prop in table.fields) {
    if (!firstLoop && !table.fields[prop].primaryKey) query += ',\n';
    firstLoop = false;

    // dont need the ID for adding new row because generated in SQL
    if(!table.fields[prop].primaryKey){
      query += `${tab}${tab}${tab}${tab}${table.fields[prop].name}: ${buildMutationArgType(table.fields[prop])}`;
      fieldNames += table.fields[prop].name + ', ';
      argNames += 'args.' + table.fields[prop].name + ', ';
    }
  }

  fieldNames = fieldNames.slice(0, -2);
  argNames = argNames.slice(0, -2);
  query += `\n${tab}${tab}${tab}},\n${tab}${tab}${tab}resolve(parent, args) {\n${tab}${tab}${tab}${tab}`;

  if (database === 'MongoDB') query += `const ${table.type.toLowerCase()} = new ${table.type}(args);\n${tab}${tab}${tab}${tab}return ${table.type.toLowerCase()}.save();`;

  if (database === 'MySQL' || database === 'PostgreSQL') {
    if (database === 'MySQL') query += `getConnection`
    if (database === 'PostgreSQL') query += `connect`
    query += `((err, con) => {\n${tab}${tab}${tab}${tab}${tab}const sql = 'INSERT INTO ${table.type} (${fieldNames}) VALUES (${argNames})';\n${tab}${tab}${tab}${tab}${tab}con.query(sql, args, (err, result) => {\n${tab}${tab}${tab}${tab}${tab}${tab}if (err) throw err;\n${tab}${tab}${tab}${tab}${tab}${tab}con.release();\n${tab}${tab}${tab}${tab}${tab}${tab}return result;\n${tab}${tab}${tab}${tab}${tab}})\n${tab}${tab}${tab}${tab}})`;
  }

  return query += `\n${tab}${tab}${tab}}\n${tab}${tab}}`;

  function buildMutationArgType(field) {
    const query = `{ type: ${checkForRequired(field.required, 'front')}${tableTypeToGraphqlType(field.type)}${checkForRequired(field.required, 'back')} }`;
    return query;
  }
}

// complete = TRUE
function updateMutation(table, database) {
  let idFieldName;
  for(let field in table.fields){
    if(table.fields[field].primaryKey){
      idFieldName = table.fields[field].name;
    }
  }

  let query = `${tab}${tab}update${table.type}: {\n${tab}${tab}${tab}type: ${table.type}Type,\n${tab}${tab}${tab}args: {\n`;

  let firstLoop = true;
  for (const prop in table.fields) {
    if (!firstLoop) query += ',\n';
    firstLoop = false;

    query += `${tab}${tab}${tab}${tab}${table.fields[prop].name}: ${buildMutationArgType(table.fields[prop])}`;
  }

  query += `\n${tab}${tab}${tab}},\n${tab}${tab}${tab}resolve(parent, args) {\n${tab}${tab}${tab}${tab}`;

  if (database === 'MongoDB') query += `return ${table.type}.findByIdAndUpdate(args.id, args);`;

  if (database === 'MySQL' || database === 'PostgreSQL') {
    if (database === 'MySQL') query += `getConnection`
    if (database === 'PostgreSQL') query += `connect`

    query += `((err, con) => {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}let updateValues = '';\n`;
    query += `${tab}${tab}${tab}${tab}${tab}for (const prop in args) {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}updateValues += \`\${prop} = '\${args[prop]}' \`\n`;
    query += `${tab}${tab}${tab}${tab}${tab}}\n`;
    query += `${tab}${tab}${tab}${tab}${tab}const sql = \`UPDATE ${table.type} SET \${updateValues} WHERE ${idFieldName} = \${args.`;
    query += `${idFieldName}}\`;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}con.query(sql, args, (err, result) => {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}if (err) throw err;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}con.release();\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}return result;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}})\n`;
    query += `${tab}${tab}${tab}${tab}})`;
  }

  return query += `\n${tab}${tab}${tab}}\n${tab}${tab}}`;

  function buildMutationArgType(field) {
    const query = `{ type: ${checkForRequired(field.required, 'front')}${tableTypeToGraphqlType(field.type)}${checkForRequired(field.required, 'back')} }`;
    return query;
  }
}

// complete = TRUE
function deleteMutation(table, database) {
  let idField;
  for(let field in table.fields){
    if(table.fields[field].primaryKey){
      idField = table.fields[field];
    }
  }
  let query = `${tab}${tab}delete${table.type}: {\n${tab}${tab}${tab}type: ${table.type}Type,\n${tab}${tab}${tab}args: { ${idField.name}: { type: ${tableTypeToGraphqlType(idField.type) }},\n${tab}${tab}${tab}resolve(parent, args) {\n${tab}${tab}${tab}${tab}`;

  if (database === 'MongoDB') query += `return ${table.type}.findByIdAndRemove(args.id);`;

  if (database === 'MySQL' || database === 'PostgreSQL') {
    if (database === 'MySQL') query += `getConnection`
    if (database === 'PostgreSQL') query += `connect`
    // const idFieldName = table.fields[0].name;

    query += `((err, con) => {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}const sql = \`DELETE FROM ${table.type} WHERE ${idField.name} = \${args.`;
    query += `${idField.name}}\`;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}con.query(sql, (err, result) => {\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}if (err) throw err;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}con.release();\n`;
    query += `${tab}${tab}${tab}${tab}${tab}${tab}return result;\n`;
    query += `${tab}${tab}${tab}${tab}${tab}})\n`;
    query += `${tab}${tab}${tab}${tab}})`;
  }

  return query += `\n${tab}${tab}${tab}}\n${tab}${tab}}`;
}

// complete = TRUE
function checkForRequired(required, position) {
  if (required) {
    if (position === 'front') {
      return 'new GraphQLNonNull(';
    }
    return ')';
  }
  return '';
}

// complete = false
// function checkForMultipleValues(multipleValues, position) {
//   if (multipleValues) {
//     if (position === 'front') {
//       return 'new GraphQLList(';
//     }
//     return ')';
//   }
//   return '';
// }


module.exports = { parseGraphqlServer, toTitleCase, createFindAllRootQuery, buildGraphqlRootQuery, createSubQuery, buildGraphqlTypeSchema };