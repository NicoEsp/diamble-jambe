import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: `Cómo ${SITE_NAME} trata tus datos personales.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const UPDATED = "7 de septiembre de 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Volver
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-slate-500">Última actualización: {UPDATED}</p>

      <div className="prose prose-slate mt-8 max-w-none text-sm leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <p>
          En {SITE_NAME} respetamos tu privacidad. Esta política explica qué datos recopilamos, con
          qué fin y qué derechos tenés. El tratamiento se realiza conforme a la Ley 25.326 de
          Protección de Datos Personales (Argentina) y normativa aplicable.
        </p>

        <h2>1. Datos que recopilamos</h2>
        <ul>
          <li>
            <strong>De tu cuenta:</strong> dirección de email y contraseña (almacenada de forma
            cifrada por nuestro proveedor de autenticación).
          </li>
          <li>
            <strong>Que cargás vos:</strong> clientes, tarifas, horas trabajadas, descripciones,
            facturas y datos de emisor que decidas completar.
          </li>
          <li>
            <strong>Técnicos:</strong> datos mínimos de sesión necesarios para el funcionamiento.
          </li>
          <li>
            <strong>De uso:</strong> páginas visitadas y acciones dentro de la aplicación (por
            ejemplo, que se registró tiempo o se generó una factura), asociadas al identificador de
            tu cuenta. No registramos el contenido que cargás: ni los nombres de tus clientes, ni
            las descripciones de tus tareas, ni los montos que facturás.
          </li>
        </ul>

        <h2>2. Para qué los usamos</h2>
        <p>
          Únicamente para prestarte el Servicio: autenticarte, guardar tu información, generar
          reportes y facturas, y compartir facturas mediante el enlace público que vos generás. No
          vendemos ni cedemos tus datos a terceros con fines comerciales.
        </p>

        <h2>3. Dónde se almacenan</h2>
        <p>
          Los datos se alojan en <strong>Supabase</strong> (infraestructura sobre PostgreSQL), que
          actúa como encargado del tratamiento. El acceso está protegido con Row Level Security, de
          modo que cada usuario sólo puede acceder a su propia información.
        </p>

        <p>
          Para las estadísticas de uso utilizamos <strong>PostHog</strong> (servidores en Estados
          Unidos), que recibe el identificador de tu cuenta, tu email y los eventos descritos en el
          punto 1. No tenemos activada la grabación de sesiones: nadie mira lo que hacés en
          pantalla. Si tu navegador envía la señal <em>Do Not Track</em>, no recolectamos nada, y
          el Servicio funciona igual.
        </p>

        <h2>4. Enlaces públicos de facturas</h2>
        <p>
          Cuando generás el enlace público de una factura, cualquiera con ese enlace puede ver su
          detalle (horas, descripciones y montos) sin necesidad de cuenta. Compartilo sólo con
          quien corresponda.
        </p>

        <h2>5. Tus derechos</h2>
        <p>
          Podés acceder, rectificar y solicitar la eliminación de tus datos. Para eliminar tu
          cuenta y toda la información asociada, contactanos por los canales del Servicio.
        </p>

        <h2>6. Conservación</h2>
        <p>
          Conservamos tus datos mientras tu cuenta esté activa. Si solicitás la baja, los
          eliminamos salvo obligación legal de conservarlos.
        </p>

        <h2>7. Cambios</h2>
        <p>
          Podemos actualizar esta política. Publicaremos la versión vigente en esta página con su
          fecha de actualización.
        </p>

        <h2>8. Contacto</h2>
        <p>
          Ante consultas sobre tus datos, escribinos a través de los canales de contacto del
          Servicio.
        </p>

        <p className="mt-8 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
          Este documento es una plantilla inicial y no constituye asesoramiento legal. Antes de
          operar comercialmente, hacelo revisar por un profesional del derecho de tu jurisdicción.
        </p>
      </div>
    </main>
  );
}
