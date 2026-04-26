export function withBaseOptions(schema) {
  schema.set('timestamps', {
    createdAt: 'created_date',
    updatedAt: 'updated_date',
  });

  schema.set('toJSON', {
    virtuals: false,
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    },
  });

  schema.set('toObject', {
    virtuals: false,
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    },
  });

  return schema;
}
