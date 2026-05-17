
const mongoose = require('mongoose');

async function fix() {
    await mongoose.connect('mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin');
    const TemplateSchema = new mongoose.Schema({ clientId: Number, name: String, components: Array }, { strict: false });
    const Template = mongoose.model('Template', TemplateSchema);

    const t = await Template.findOne({ clientId: 15, name: 'fathers_day_special' });
    if (t) {
        console.log('Found template, updating components...');
        const components = t.components.map(c => {
            if (c.type === 'HEADER') {
                return { ...c, mediaId: '952913800846500' };
            }
            return c;
        });
        await Template.updateOne({ _id: t._id }, { $set: { components } });
        console.log('Update successful!');
    } else {
        console.log('Template not found!');
    }
    process.exit(0);
}

fix();
